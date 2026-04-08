import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  orderBy,
  where,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { File as ExpoFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { auth, db, storage } from './firebase';
import { DiaryEntry } from '../types/DiaryEntry';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { encryptText, decryptText, encryptBytes, decryptBytes } from './encryptionService';

const ENTRIES_COLLECTION = 'diary_entries';
const USERS_COLLECTION = 'users';
const DECRYPTED_IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}decrypted_images/`;
const DECRYPTED_VIDEO_CACHE_DIR = `${FileSystem.cacheDirectory}decrypted_videos/`;
const VIDEO_THUMBNAIL_CACHE_DIR = `${FileSystem.cacheDirectory}video_thumbnails/`;
const DECRYPTED_VIDEO_CACHE_VERSION = 'v2';
const VIDEO_ENCRYPTION_MAGIC = 'MYDV1';
const VIDEO_CHUNK_SIZE_BYTES = 1024 * 1024;
const VIDEO_ROUNDTRIP_VERIFY_MAX_MB = 25;
const VIDEO_ENCRYPTION_MAGIC_BYTES = new Uint8Array(Array.from(VIDEO_ENCRYPTION_MAGIC).map((c) => c.charCodeAt(0)));

const ensureDecryptedImageCacheDir = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(DECRYPTED_IMAGE_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DECRYPTED_IMAGE_CACHE_DIR, { intermediates: true });
  }
};

const ensureDecryptedVideoCacheDir = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(DECRYPTED_VIDEO_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DECRYPTED_VIDEO_CACHE_DIR, { intermediates: true });
  }
};

const ensureVideoThumbnailCacheDir = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(VIDEO_THUMBNAIL_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_THUMBNAIL_CACHE_DIR, { intermediates: true });
  }
};

const hashString = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const uint32ToBytes = (value: number): Uint8Array => {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
};

const bytesToUint32 = (bytes: Uint8Array): number => {
  return ((bytes[0] << 24) >>> 0) + ((bytes[1] << 16) >>> 0) + ((bytes[2] << 8) >>> 0) + bytes[3];
};

const appendBytesToFile = async (fileUri: string, bytes: Uint8Array): Promise<void> => {
  await FileSystem.writeAsStringAsync(fileUri, encodeBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
    append: true,
  });
};

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const asciiBytes = (value: string): Uint8Array =>
  new Uint8Array(Array.from(value).map((char) => char.charCodeAt(0)));

const FTYP_BYTES = asciiBytes('ftyp');
const RIFF_BYTES = asciiBytes('RIFF');
const AVI_BYTES = asciiBytes('AVI ');
const OGGS_BYTES = asciiBytes('OggS');
const EBML_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);

const containsSubsequence = (bytes: Uint8Array, needle: Uint8Array): boolean => {
  if (needle.length === 0 || bytes.length < needle.length) {
    return false;
  }

  for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }

  return false;
};

const detectPlayableVideoExtension = (uri: string): string | null => {
  try {
    const file = new ExpoFile(uri);
    if (!file.exists || file.size < 32) {
      return null;
    }

    const handle = file.open();
    try {
      const headerBytes = handle.readBytes(Math.min(128, file.size));
      if (containsSubsequence(headerBytes, FTYP_BYTES)) {
        return 'mp4';
      }
      if (headerBytes.length >= 12 && bytesEqual(headerBytes.slice(0, 4), RIFF_BYTES) && containsSubsequence(headerBytes, AVI_BYTES)) {
        return 'avi';
      }
      if (headerBytes.length >= 4 && bytesEqual(headerBytes.slice(0, 4), OGGS_BYTES)) {
        return 'ogg';
      }
      if (headerBytes.length >= 4 && bytesEqual(headerBytes.slice(0, 4), EBML_BYTES)) {
        return 'webm';
      }
      return null;
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
};

const looksLikePlayableVideoFile = (uri: string): boolean => detectPlayableVideoExtension(uri) !== null;

const encryptVideoFileChunked = async (
  inputUri: string,
  outputUri: string,
  onProgress?: (progress: number) => void
): Promise<void> => {
  const inputFile = new ExpoFile(inputUri);
  if (!inputFile.exists || inputFile.size <= 0) {
    throw new Error('Videotiedostoa ei löytynyt salattavaksi');
  }

  const outputFile = new ExpoFile(outputUri);
  outputFile.create({ intermediates: true, overwrite: true });

  const inputHandle = inputFile.open();
  const outputHandle = outputFile.open();

  try {
    outputHandle.writeBytes(VIDEO_ENCRYPTION_MAGIC_BYTES);

    const totalSize = inputFile.size;
    const totalChunks = Math.max(1, Math.ceil(totalSize / VIDEO_CHUNK_SIZE_BYTES));
    let processedChunks = 0;

    const startTime = Date.now();
    console.log(`🔐 [encryptVideoFileChunked] START: ${Math.round(totalSize / (1024 * 1024))} MB, ${totalChunks} chunks, ${VIDEO_CHUNK_SIZE_BYTES / 1024} KB per chunk`);

    while ((inputHandle.offset ?? 0) < totalSize) {
      // Give UI a chance to breathe every 5 chunks (avoid 1-2 min freeze)
      if (processedChunks > 0 && processedChunks % 5 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const remaining = totalSize - (inputHandle.offset ?? 0);
      const length = Math.min(VIDEO_CHUNK_SIZE_BYTES, remaining);
      const rawChunk = inputHandle.readBytes(length);
      const encryptedChunk = encryptBytes(rawChunk);

      outputHandle.writeBytes(uint32ToBytes(encryptedChunk.length));
      outputHandle.writeBytes(encryptedChunk);

      processedChunks += 1;
      const progress = Math.round((processedChunks / totalChunks) * 100);
      onProgress?.(progress);

      if (processedChunks === 1 || processedChunks % 10 === 0 || processedChunks === totalChunks) {
        const elapsed = Date.now() - startTime;
        const elapsedSeconds = (elapsed / 1000).toFixed(1);
        console.log(`🔐 [encryptVideoFileChunked] Progress: ${processedChunks}/${totalChunks} (${progress}%) - ${elapsedSeconds}s elapsed`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [encryptVideoFileChunked] DONE: ${totalTime}s total`);
  } finally {
    inputHandle.close();
    outputHandle.close();
  }
};

const decryptChunkedVideoFile = async (encryptedUri: string, outputUri: string): Promise<void> => {
  const encryptedFile = new ExpoFile(encryptedUri);
  if (!encryptedFile.exists || encryptedFile.size <= 0) {
    throw new Error('Salattua videotiedostoa ei löytynyt');
  }

  const outputFile = new ExpoFile(outputUri);
  outputFile.create({ intermediates: true, overwrite: true });

  const inputHandle = encryptedFile.open();
  const outputHandle = outputFile.open();

  try {
    const magicBytes = inputHandle.readBytes(VIDEO_ENCRYPTION_MAGIC_BYTES.length);
    if (!bytesEqual(magicBytes, VIDEO_ENCRYPTION_MAGIC_BYTES)) {
      throw new Error('Virheellinen salattu videomuoto (magic header puuttuu)');
    }

    let processedChunks = 0;
    const startTime = Date.now();
    console.log(`🔓 [decryptChunkedVideoFile] START: ${Math.round(encryptedFile.size / (1024 * 1024))} MB encrypted`);

    while ((inputHandle.offset ?? 0) < encryptedFile.size) {
      // Give UI a chance to breathe every 5 chunks (avoid UI freeze)
      if (processedChunks > 0 && processedChunks % 5 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const remaining = encryptedFile.size - (inputHandle.offset ?? 0);
      if (remaining === 0) {
        break;
      }
      if (remaining < 4) {
        throw new Error('Virheellinen salattu videomuoto (chunk length puuttuu)');
      }

      const lenBytes = inputHandle.readBytes(4);
      if (lenBytes.length !== 4) {
        throw new Error('Virheellinen salattu videomuoto (chunk length puuttuu)');
      }

      const chunkLength = bytesToUint32(lenBytes);
      const remainingAfterLength = encryptedFile.size - (inputHandle.offset ?? 0);
      if (chunkLength <= 0 || chunkLength > remainingAfterLength) {
        throw new Error(`Virheellinen salattu videomuoto (chunkLength=${chunkLength})`);
      }

      const encChunkBytes = inputHandle.readBytes(chunkLength);
      const decChunkBytes = decryptBytes(encChunkBytes);
      outputHandle.writeBytes(decChunkBytes);

      processedChunks += 1;
      if (processedChunks % 20 === 0) {
        const elapsed = Date.now() - startTime;
        console.log(`🔓 [decryptChunkedVideoFile] Progress: ${processedChunks} chunks, ${(elapsed / 1000).toFixed(1)}s elapsed`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [decryptChunkedVideoFile] DONE: ${totalTime}s total, ${processedChunks} chunks`);
  } finally {
    inputHandle.close();
    outputHandle.close();
  }

  const outputFileInfo = new ExpoFile(outputUri);
  if (!outputFileInfo.exists || outputFileInfo.size < 1024) {
    throw new Error('Videon purku tuotti virheellisen tai tyhjän tiedoston');
  }
};

const decryptChunkedVideoFileFallbackWholeRead = async (
  encryptedUri: string,
  outputUri: string
): Promise<void> => {
  const encryptedFile = new ExpoFile(encryptedUri);
  const bytes = await encryptedFile.bytes();
  const outputFile = new ExpoFile(outputUri);
  outputFile.create({ intermediates: true, overwrite: true });
  const outputHandle = outputFile.open();

  try {
    if (bytes.length < VIDEO_ENCRYPTION_MAGIC_BYTES.length) {
      throw new Error('Salattu videotiedosto on liian lyhyt');
    }

    const magic = bytes.slice(0, VIDEO_ENCRYPTION_MAGIC_BYTES.length);
    if (!bytesEqual(magic, VIDEO_ENCRYPTION_MAGIC_BYTES)) {
      throw new Error('Tuntematon salatun videon formaatti');
    }

    let offset = VIDEO_ENCRYPTION_MAGIC_BYTES.length;
    while (offset < bytes.length) {
      if (offset + 4 > bytes.length) {
        throw new Error('Virheellinen salattu videomuoto (chunk length puuttuu fallbackissa)');
      }

      const chunkLength = bytesToUint32(bytes.slice(offset, offset + 4));
      offset += 4;

      if (chunkLength <= 0 || offset + chunkLength > bytes.length) {
        throw new Error(`Virheellinen salattu videomuoto fallbackissa (chunkLength=${chunkLength})`);
      }

      const encChunk = bytes.slice(offset, offset + chunkLength);
      const decChunk = decryptBytes(encChunk);
      outputHandle.writeBytes(decChunk);
      offset += chunkLength;
    }
  } finally {
    outputHandle.close();
  }

  const outputInfo = new ExpoFile(outputUri);
  if (!outputInfo.exists || outputInfo.size < 1024) {
    throw new Error('Videon purku fallbackissa tuotti virheellisen tai tyhjän tiedoston');
  }
};

const isEncryptedImageUrl = (url: string): boolean => {
  // Uudet salatut tiedostot tallennetaan .enc-päätteellä
  return /\.enc(\?|$)/.test(url);
};

const isEncryptedVideoUrl = (url: string): boolean => {
  // Uudet salatut videot tallennetaan .enc-päätteellä
  return /\.enc(\?|$)/.test(url);
};

const getDecryptedVideoCachePath = (videoUrl: string): string => {
  const fileName = `${hashString(videoUrl)}_${DECRYPTED_VIDEO_CACHE_VERSION}.mp4`;
  return `${DECRYPTED_VIDEO_CACHE_DIR}${fileName}`;
};

const getVideoThumbnailCachePath = (videoUrl: string): string => {
  const fileName = `${hashString(videoUrl)}_${DECRYPTED_VIDEO_CACHE_VERSION}.jpg`;
  return `${VIDEO_THUMBNAIL_CACHE_DIR}${fileName}`;
};

export const getCachedVideoThumbnailUri = async (videoUrl: string): Promise<string | null> => {
  try {
    await ensureVideoThumbnailCacheDir();
    const thumbnailPath = getVideoThumbnailCachePath(videoUrl);
    const info = await FileSystem.getInfoAsync(thumbnailPath);
    return info.exists ? thumbnailPath : null;
  } catch {
    return null;
  }
};

export const ensureVideoThumbnailCached = async (videoUrl: string): Promise<string | null> => {
  try {
    const existing = await getCachedVideoThumbnailUri(videoUrl);
    if (existing) {
      return existing;
    }

    const playableUri = await resolveVideoUriForPlayback(videoUrl);
    if (/\.enc(\?|$)/.test(playableUri)) {
      return null;
    }

    await prewarmVideoThumbnailCache(videoUrl, playableUri);
    return await getCachedVideoThumbnailUri(videoUrl);
  } catch (error) {
    console.log('⚠️ [ensureVideoThumbnailCached] Failed:', error);
    return null;
  }
};

const prewarmDecryptedVideoCache = async (videoUrl: string, sourceUri: string): Promise<void> => {
  try {
    await ensureDecryptedVideoCacheDir();
    const localPath = getDecryptedVideoCachePath(videoUrl);

    const cachedInfo = await FileSystem.getInfoAsync(localPath);
    if (cachedInfo.exists && looksLikePlayableVideoFile(localPath)) {
      return;
    }

    await FileSystem.copyAsync({ from: sourceUri, to: localPath });
    if (!looksLikePlayableVideoFile(localPath)) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      throw new Error('Prewarmed video cache was not playable');
    }

    console.log(`🎬 [uploadVideo] Prewarmed decrypted cache: ${localPath}`);
  } catch (error) {
    // Cache warmup is best-effort and must not fail upload.
    console.log('⚠️ [uploadVideo] Failed to prewarm decrypted cache:', error);
  }
};

const prewarmVideoThumbnailCache = async (videoUrl: string, sourceUri: string): Promise<void> => {
  try {
    await ensureVideoThumbnailCacheDir();
    const thumbnailPath = getVideoThumbnailCachePath(videoUrl);

    const existing = await FileSystem.getInfoAsync(thumbnailPath);
    if (existing.exists) {
      return;
    }

    const generated = await VideoThumbnails.getThumbnailAsync(sourceUri, {
      time: 0,
      quality: 0.6,
    });

    if (!generated?.uri) {
      return;
    }

    await FileSystem.copyAsync({ from: generated.uri, to: thumbnailPath });
    console.log(`🎬 [uploadVideo] Prewarmed thumbnail cache: ${thumbnailPath}`);
  } catch (error) {
    // Thumbnail warmup is best-effort and must not fail upload.
    console.log('⚠️ [uploadVideo] Failed to prewarm thumbnail cache:', error);
  }
};

export interface UploadedVideoAsset {
  videoUrl: string;
  thumbnailUrl?: string;
}

const uploadVideoThumbnail = async (
  sourceUri: string,
  userId: string
): Promise<string | undefined> => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      return undefined;
    }

    const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
      return undefined;
    }

    const generated = await VideoThumbnails.getThumbnailAsync(sourceUri, {
      time: 0,
      quality: 0.7,
    });

    if (!generated?.uri) {
      return undefined;
    }

    const filename = `video_thumbnails/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const encodedFilename = encodeURIComponent(filename);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, generated.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
      },
    });

    if (!uploadResult || uploadResult.status < 200 || uploadResult.status >= 300) {
      return undefined;
    }

    const responseData = JSON.parse(uploadResult.body);
    const downloadToken = responseData.downloadTokens;
    if (!downloadToken) {
      return undefined;
    }

    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedFilename}?alt=media&token=${downloadToken}`;
  } catch (error) {
    console.log('⚠️ [uploadVideo] Thumbnail upload failed:', error);
    return undefined;
  }
};

const decryptImageUrlToLocalUri = async (imageUrl: string): Promise<string> => {
  if (!isEncryptedImageUrl(imageUrl)) {
    return imageUrl;
  }

  try {
    await ensureDecryptedImageCacheDir();
    const fileName = `${hashString(imageUrl)}.jpg`;
    const localPath = `${DECRYPTED_IMAGE_CACHE_DIR}${fileName}`;

    const cachedInfo = await FileSystem.getInfoAsync(localPath);
    if (cachedInfo.exists) {
      return localPath;
    }

    const response = await fetch(imageUrl);
    const encryptedBuffer = await response.arrayBuffer();
    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const decryptedBytes = decryptBytes(encryptedBytes);

    await FileSystem.writeAsStringAsync(localPath, encodeBase64(decryptedBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });

    return localPath;
  } catch (error) {
    console.error('Error decrypting image URL:', error);
    // Fallback: palauta alkuperäinen URL, jotta vanhat tai virheelliset tiedostot eivät riko UI:ta
    return imageUrl;
  }
};

const decryptVideoUrlToLocalUri = async (videoUrl: string): Promise<string> => {
  if (!isEncryptedVideoUrl(videoUrl)) {
    return videoUrl;
  }

  try {
    await ensureDecryptedVideoCacheDir();
    const localPath = getDecryptedVideoCachePath(videoUrl);

    const cachedInfo = await FileSystem.getInfoAsync(localPath);
    if (cachedInfo.exists) {
      if (looksLikePlayableVideoFile(localPath)) {
        return localPath;
      }

      console.error('Cached decrypted video is invalid, recreating:', localPath);
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }

    const encryptedPath = `${DECRYPTED_VIDEO_CACHE_DIR}${hashString(videoUrl)}.enc`;
    const downloadResult = await FileSystem.downloadAsync(videoUrl, encryptedPath);

    const downloadedFile = new ExpoFile(downloadResult.uri);
    const magicHandle = downloadedFile.open();
    const magicBytes = magicHandle.readBytes(VIDEO_ENCRYPTION_MAGIC_BYTES.length);
    magicHandle.close();

    if (bytesEqual(magicBytes, VIDEO_ENCRYPTION_MAGIC_BYTES)) {
      try {
        await decryptChunkedVideoFile(downloadResult.uri, localPath);
      } catch (chunkDecryptError) {
        console.error('Chunked video decrypt failed, trying fallback parser:', chunkDecryptError);
        await decryptChunkedVideoFileFallbackWholeRead(downloadResult.uri, localPath);
      }
    } else {
      // Taaksepäin-yhteensopivuus vanhoille (ei-chunkatuille) salatuille videoille
      const response = await fetch(videoUrl);
      const encryptedBuffer = await response.arrayBuffer();
      const encryptedBytes = new Uint8Array(encryptedBuffer);
      const decryptedBytes = decryptBytes(encryptedBytes);
      await FileSystem.writeAsStringAsync(localPath, encodeBase64(decryptedBytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    await FileSystem.deleteAsync(encryptedPath, { idempotent: true });

    const detectedExtension = detectPlayableVideoExtension(localPath);
    if (!detectedExtension) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      throw new Error('Purettu videotiedosto ei ole kelvollinen videoformaatti');
    }

    return localPath;
  } catch (error) {
    console.error('Error decrypting video URL:', error);
    if (error instanceof Error && /memory|allocation|out of memory/i.test(error.message)) {
      console.error('Videon purku epäonnistui muistirajaan. Kokeile lyhyempää videota tai tehokkaampaa laitetta.');
    }
    return videoUrl;
  }
};

/**
 * Upload an image to Firebase Storage
 */
export const uploadImage = async (uri: string, userId: string): Promise<string> => {
  try {
    // Lue kuva base64-muodossa, salaa client-puolella ja lähetä vain salattu binääri
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const rawBytes = decodeBase64(base64);
    const encryptedBytes = encryptBytes(rawBytes);
    const encryptedBase64 = encodeBase64(encryptedBytes);

    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Ei kirjautumistietoja');

    const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) throw new Error('Firebase storage bucket puuttuu ympäristömuuttujista');

    const filename = `images/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg.enc`;
    const encodedFilename = encodeURIComponent(filename);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    const tempFilePath = `${FileSystem.cacheDirectory}enc_img_${Date.now()}_${Math.random().toString(36).slice(2)}.enc`;
    await FileSystem.writeAsStringAsync(tempFilePath, encryptedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const result = await FileSystem.uploadAsync(uploadUrl, tempFilePath, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
    });

    await FileSystem.deleteAsync(tempFilePath, { idempotent: true });

    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Kuvan upload epäonnistui (status ${result?.status}): ${result?.body}`);
    }

    const responseData = JSON.parse(result.body);
    const downloadToken = responseData.downloadTokens;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedFilename}?alt=media&token=${downloadToken}`;

    return downloadUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

/**
 * Upload multiple images to Firebase Storage
 */
export const uploadImages = async (uris: string[], userId: string): Promise<string[]> => {
  const uploadPromises = uris.map((uri) => uploadImage(uri, userId));
  return Promise.all(uploadPromises);
};

/**
 * Upload a video to Firebase Storage.
 * Turvamalli:
 * - video salataan AINA client-puolella ennen uploadia
 * - liian isot videot estetään, jotta sovellus ei kaadu muistirajoihin
 */
export const uploadVideo = async (
  uri: string,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<UploadedVideoAsset> => {
  let uploadSourceUri: string | null = null;
  let verifyOutputUri: string | null = null;
  try {
    const MAX_VIDEO_MB = 500;

    console.log(`🎥 [uploadVideo] START: user=${userId}`);
    console.log(`🎥 [uploadVideo] Source URI: ${uri}`);
    onProgress?.(0);

    // Check file size before uploading
    let sizeMB = 0;
    const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size !== undefined) {
      sizeMB = fileInfo.size / (1024 * 1024);
      console.log(`🎥 [uploadVideo] Source size: ${sizeMB.toFixed(2)} MB`);
      if (sizeMB > MAX_VIDEO_MB) {
        throw new Error(`Video on liian suuri (${sizeMB.toFixed(0)} Mt). Maksimikoko on ${MAX_VIDEO_MB} Mt.`);
      }
    }

    // Get Firebase auth token for REST API call
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Ei kirjautumistietoja');

    const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) throw new Error('Firebase storage bucket puuttuu ympäristömuuttujista');

    const filename = `videos/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.mp4.enc`;
    const encodedFilename = encodeURIComponent(filename);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    uploadSourceUri = `${FileSystem.cacheDirectory}enc_vid_${Date.now()}_${Math.random().toString(36).slice(2)}.enc`;
    await encryptVideoFileChunked(uri, uploadSourceUri, (encryptionProgress) => {
      // Varaamme 45% salausvaiheelle, jotta käyttäjä näkee heti etenemistä
      const combinedProgress = Math.max(1, Math.min(45, Math.round(encryptionProgress * 0.45)));
      onProgress?.(combinedProgress);
    });

    const encryptedOutInfo = new ExpoFile(uploadSourceUri);
    if (!encryptedOutInfo.exists || encryptedOutInfo.size <= 0) {
      throw new Error('Salatun videon väliaikaistiedostoa ei voitu luoda');
    }

    if (sizeMB > 0 && sizeMB <= VIDEO_ROUNDTRIP_VERIFY_MAX_MB) {
      verifyOutputUri = `${FileSystem.cacheDirectory}verify_vid_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`;
      await decryptChunkedVideoFile(uploadSourceUri, verifyOutputUri);

      const originalType = detectPlayableVideoExtension(uri);
      const verifiedType = detectPlayableVideoExtension(verifyOutputUri);
      console.log(`[uploadVideo] Roundtrip verify original=${originalType ?? 'unknown'} verified=${verifiedType ?? 'unknown'}`);
      if (!verifiedType) {
        throw new Error('Videon salausverifiointi epäonnistui ennen uploadia');
      }
    } else {
      console.log(`[uploadVideo] Roundtrip verify skipped for large file (${sizeMB.toFixed(1)} MB)`);
    }

    const encryptedInfo = await FileSystem.getInfoAsync(uploadSourceUri, { size: true });
    if (encryptedInfo.exists && 'size' in encryptedInfo && encryptedInfo.size !== undefined) {
      console.log(
        `[uploadVideo] Encrypted temp file ready: ${(encryptedInfo.size / (1024 * 1024)).toFixed(2)} MB`
      );
    }

    let lastUploadLogProgress = -1;
    console.log('[uploadVideo] Upload transfer started');

    const task = FileSystem.createUploadTask(
      uploadUrl,
      uploadSourceUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0) {
          const uploadProgress = Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100);
          const combinedProgress = Math.min(99, 45 + Math.round(uploadProgress * 0.55));
          onProgress?.(combinedProgress);

          if (
            uploadProgress === 0 ||
            uploadProgress === 100 ||
            uploadProgress - lastUploadLogProgress >= 10
          ) {
            console.log(
              `[uploadVideo] Upload progress: ${uploadProgress}% (${data.totalBytesSent}/${data.totalBytesExpectedToSend} bytes)`
            );
            lastUploadLogProgress = uploadProgress;
          }
        }
      }
    );

    const result = await task.uploadAsync();

    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Upload epäonnistui (status ${result?.status}): ${result?.body}`);
    }

    const responseData = JSON.parse(result.body);
    const downloadToken = responseData.downloadTokens;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedFilename}?alt=media&token=${downloadToken}`;

    // Avoid a second heavy decrypt in Timeline thumbnail generation by prewarming cache now.
    await prewarmDecryptedVideoCache(downloadUrl, verifyOutputUri ?? uri);
    await prewarmVideoThumbnailCache(downloadUrl, verifyOutputUri ?? uri);

    const thumbnailUrl = await uploadVideoThumbnail(verifyOutputUri ?? uri, userId);

    onProgress?.(100);
    console.log('[uploadVideo] Upload completed successfully');

    return {
      videoUrl: downloadUrl,
      thumbnailUrl,
    };
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  } finally {
    if (uploadSourceUri) {
      await FileSystem.deleteAsync(uploadSourceUri, { idempotent: true });
    }
    if (verifyOutputUri) {
      await FileSystem.deleteAsync(verifyOutputUri, { idempotent: true });
    }
  }
};

/**
 * Upload multiple videos to Firebase Storage
 */
export const uploadVideos = async (
  uris: string[],
  userId: string,
  onProgress?: (progress: number) => void
): Promise<UploadedVideoAsset[]> => {
  const uploadPromises = uris.map((uri, index) =>
    uploadVideo(uri, userId, (progress) => {
      // Approximate overall progress across all videos
      const combinedProgress = Math.round(
        ((index / uris.length) + progress / 100 / uris.length) * 100
      );
      onProgress?.(combinedProgress);
    })
  );
  return Promise.all(uploadPromises);
};

/**
 * Create a new diary entry
 */
export const createEntry = async (
  entry: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<string> => {
  try {
    const now = Timestamp.now();

    // Salataan arkaluonteiset tekstikentät ennen Firestoreen kirjoittamista
    const encTitle = encryptText(entry.title);
    const encContent = encryptText(entry.content);
    const encAddress =
      entry.location?.address ? encryptText(entry.location.address) : undefined;

    const docData: any = {
      userId,
      title: encTitle,
      content: encContent,
      images: entry.images || [],
      videos: entry.videos || [],
      videoThumbnails: entry.videoThumbnails || {},
      date: Timestamp.fromDate(entry.date),
      location: entry.location
        ? {
            latitude: entry.location.latitude,
            longitude: entry.location.longitude,
            // Koordinaatit tallennetaan selvinä (ei yksin tunnistavia),
            // osoite salataan
            ...(encAddress !== undefined ? { address: encAddress } : {}),
          }
        : null,
      shared: entry.shared || false,
      _encrypted: true, // Lippu: kentät ovat salattuja
      createdAt: now,
      updatedAt: now,
    };

    // Lisää valinnaiset layout-kentät vain jos niillä on arvo
    if (entry.layout !== undefined) docData.layout = entry.layout;
    if (entry.textPosition !== undefined) docData.textPosition = entry.textPosition;
    if (entry.imageShape !== undefined) docData.imageShape = entry.imageShape;
    if (entry.textOverlay !== undefined) docData.textOverlay = entry.textOverlay;

    const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), docData);

    return docRef.id;
  } catch (error) {
    console.error('Error creating entry:', error);
    throw error;
  }
};

/**
 * Update an existing diary entry
 */
export const updateEntry = async (
  id: string,
  updates: Partial<DiaryEntry>
): Promise<void> => {
  try {
    const entryRef = doc(db, ENTRIES_COLLECTION, id);

    // Poista undefined-arvot (Firestore ei hyväksy niitä)
    const cleanedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    ) as Partial<DiaryEntry>;

    // Salaa päivitettävät tekstikentät
    const encryptedUpdates: any = { ...cleanedUpdates, updatedAt: Timestamp.now() };
    if (updates.title !== undefined) {
      encryptedUpdates.title = encryptText(updates.title);
    }
    if (updates.content !== undefined) {
      encryptedUpdates.content = encryptText(updates.content);
    }
    if (updates.location !== undefined) {
      const nextLocation: any = {};
      if (updates.location.latitude !== undefined) {
        nextLocation.latitude = updates.location.latitude;
      }
      if (updates.location.longitude !== undefined) {
        nextLocation.longitude = updates.location.longitude;
      }
      if (updates.location.address !== undefined) {
        nextLocation.address = encryptText(updates.location.address);
      }
      if (Object.keys(nextLocation).length > 0) {
        encryptedUpdates.location = nextLocation;
      }
    }
    encryptedUpdates._encrypted = true;

    await updateDoc(entryRef, encryptedUpdates);
  } catch (error) {
    console.error('Error updating entry:', error);
    throw error;
  }
};

/**
 * Delete a diary entry
 */
export const deleteEntry = async (id: string): Promise<void> => {
  try {
    const entryRef = doc(db, ENTRIES_COLLECTION, id);
    await deleteDoc(entryRef);
  } catch (error) {
    console.error('Error deleting entry:', error);
    throw error;
  }
};

/**
 * Get all diary entries for a user
 */
export const getEntries = async (userId: string): Promise<DiaryEntry[]> => {
  try {
    const q = query(
      collection(db, ENTRIES_COLLECTION),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const entries = await Promise.all(
      querySnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const isEncrypted = data._encrypted === true;

        // Pura salaus jos kentät ovat salattuja, muuten käytä suoraan
        // (taaksepäin-yhteensopivuus vanhoille merkinnöille)
        const title = isEncrypted ? decryptText(data.title) : data.title;
        const content = isEncrypted ? decryptText(data.content) : data.content;
        const address = data.location?.address
          ? isEncrypted
            ? decryptText(data.location.address)
            : data.location.address
          : undefined;

        const decryptedImages = await Promise.all(
          (data.images || []).map((imageUrl: string) => decryptImageUrlToLocalUri(imageUrl))
        );
        return {
          id: docSnap.id,
          title,
          content,
          images: decryptedImages,
          videos: data.videos || [],
          videoThumbnails: data.videoThumbnails || {},
          date: data.date.toDate(),
          location: data.location
            ? {
                latitude: data.location.latitude,
                longitude: data.location.longitude,
                address,
              }
            : undefined,
          shared: data.shared || false,
          layout: data.layout,
          textPosition: data.textPosition,
          imageShape: data.imageShape,
          textOverlay: data.textOverlay,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        } as DiaryEntry;
      })
    );

    return entries;
  } catch (error) {
    console.error('Error getting entries:', error);
    throw error;
  }
};

/**
 * Get all diary entries for a user (FAST).
 * Purkaa vain tekstikentät heti; kuvat jätetään alkuperäisiksi URL:eiksi.
 * Käytä yhdessä `resolveEntryImagesInBackground`-funktion kanssa.
 */
export const getEntriesFast = async (
  userId: string,
  limitCount?: number
): Promise<DiaryEntry[]> => {
  try {
    const q = limitCount
      ? query(
          collection(db, ENTRIES_COLLECTION),
          where('userId', '==', userId),
          orderBy('date', 'desc'),
          limit(limitCount)
        )
      : query(
          collection(db, ENTRIES_COLLECTION),
          where('userId', '==', userId),
          orderBy('date', 'desc')
        );

    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const isEncrypted = data._encrypted === true;

      const title = isEncrypted ? decryptText(data.title) : data.title;
      const content = isEncrypted ? decryptText(data.content) : data.content;
      const address = data.location?.address
        ? isEncrypted
          ? decryptText(data.location.address)
          : data.location.address
        : undefined;

      return {
        id: docSnap.id,
        title,
        content,
        images: data.images || [],
        videos: data.videos || [],
        videoThumbnails: data.videoThumbnails || {},
        date: data.date.toDate(),
        location: data.location
          ? {
              latitude: data.location.latitude,
              longitude: data.location.longitude,
              address,
            }
          : undefined,
        shared: data.shared || false,
        layout: data.layout,
        textPosition: data.textPosition,
        imageShape: data.imageShape,
        textOverlay: data.textOverlay,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as DiaryEntry;
    });
  } catch (error) {
    console.error('Error getting entries fast:', error);
    throw error;
  }
};

/**
 * Purkaa merkintöjen kuvat taustalla.
 * Tätä voidaan käyttää nopean listauksen jälkeen, jotta UI aukeaa heti.
 */
export const resolveEntryImagesInBackground = async (
  entries: DiaryEntry[]
): Promise<DiaryEntry[]> => {
  return Promise.all(
    entries.map(async (entry) => {
      if (!entry.images?.length) {
        return entry;
      }

      const decryptedImages = await Promise.all(
        entry.images.map((imageUrl) => decryptImageUrlToLocalUri(imageUrl))
      );

      return {
        ...entry,
        images: decryptedImages,
      };
    })
  );
};

/**
 * Purkaa yhden merkinnän kuvat ja videot paikallisiksi URI:eiksi.
 * Käytetään erityisesti detail-näkymässä, jotta .enc-videot avautuvat varmasti.
 */
export const resolveEntryMediaUris = async (entry: DiaryEntry): Promise<DiaryEntry> => {
  const decryptedImages = await Promise.all(
    (entry.images || []).map((imageUrl) => decryptImageUrlToLocalUri(imageUrl))
  );
  const decryptedVideos = await Promise.all(
    (entry.videos || []).map((videoUrl) => decryptVideoUrlToLocalUri(videoUrl))
  );

  return {
    ...entry,
    images: decryptedImages,
    videos: decryptedVideos,
  };
};

/** Purkaa yksittäisen videon URI:n soittokelpoiseksi paikalliseksi poluksi tarvittaessa. */
export const resolveVideoUriForPlayback = async (videoUri: string): Promise<string> => {
  const resolved = await decryptVideoUrlToLocalUri(videoUri);
  if (/\.enc(\?|$)/.test(videoUri) && /\.enc(\?|$)/.test(resolved)) {
    throw new Error('Videon salauksen purku epäonnistui');
  }
  return resolved;
};

/**
 * Get entries for a specific date range
 */
export const getEntriesInRange = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<DiaryEntry[]> => {
  try {
    const q = query(
      collection(db, ENTRIES_COLLECTION),
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const entries = await Promise.all(
      querySnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const isEncrypted = data._encrypted === true;

        const title = isEncrypted ? decryptText(data.title) : data.title;
        const content = isEncrypted ? decryptText(data.content) : data.content;
        const address = data.location?.address
          ? isEncrypted
            ? decryptText(data.location.address)
            : data.location.address
          : undefined;

        const decryptedImages = await Promise.all(
          (data.images || []).map((imageUrl: string) => decryptImageUrlToLocalUri(imageUrl))
        );
        return {
          id: docSnap.id,
          title,
          content,
          images: decryptedImages,
          videos: data.videos || [],
          videoThumbnails: data.videoThumbnails || {},
          date: data.date.toDate(),
          location: data.location
            ? { latitude: data.location.latitude, longitude: data.location.longitude, address }
            : undefined,
          shared: data.shared || false,
          layout: data.layout,
          textPosition: data.textPosition,
          imageShape: data.imageShape,
          textOverlay: data.textOverlay,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        } as DiaryEntry;
      })
    );

    return entries;
  } catch (error) {
    console.error('Error getting entries in range:', error);
    throw error;
  }
};

/**
 * Upload profile image to Firebase Storage
 */
export const uploadProfileImage = async (uri: string, userId: string): Promise<string> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const storageRef = ref(storage, `profile_images/${userId}/profile.jpg`);
    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

    return downloadUrl;
  } catch (error) {
    console.error('Error uploading profile image:', error);
    throw error;
  }
};

/**
 * Update user profile with photo URL
 */
export const updateUserProfile = async (userId: string, photoURL: string): Promise<void> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await setDoc(userRef, { photoURL, updatedAt: Timestamp.now() }, { merge: true });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Get user profile
 */
export const getUserProfile = async (userId: string): Promise<{ photoURL?: string } | null> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data() as { photoURL?: string };
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};
