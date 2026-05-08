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
import { ref, uploadBytes, getDownloadURL, getBytes, deleteObject } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { auth, db, storage } from './firebase';
import { DiaryEntry } from '../types/DiaryEntry';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { encryptText, decryptText, encryptBytes, decryptBytes } from './encryptionService';

const ENTRIES_COLLECTION = 'diary_entries';
const USERS_COLLECTION = 'users';
const DECRYPTED_IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}decrypted_images/`;
const VIDEO_THUMBNAIL_CACHE_DIR = `${FileSystem.cacheDirectory}video_thumbnails/`;
const USER_PROFILE_CACHE_TTL_MS = 5 * 60_000; // 5 minuuttia
const decryptedImagePathCache = new Map<string, string>();

const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    // Avoid verbose logging cost in production/hot paths.
  }
};

type UserProfileData = {
  photoURL?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

const userProfileCache = new Map<string, { data: UserProfileData | null; expiresAt: number }>();

const ensureDecryptedImageCacheDir = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(DECRYPTED_IMAGE_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DECRYPTED_IMAGE_CACHE_DIR, { intermediates: true });
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

const inferImageExtension = (bytes: Uint8Array): string => {
  // JPEG
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }

  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }

  // GIF
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'gif';
  }

  // WebP (RIFF....WEBP)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }

  // HEIC/HEIF (ISO BMFF with 'ftyp' brand)
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.includes('heic') || brand.includes('heix') || brand.includes('hevc') || brand.includes('hevx')) {
      return 'heic';
    }
    if (brand.includes('heif') || brand.includes('heim') || brand.includes('heis') || brand.includes('mif1')) {
      return 'heif';
    }
  }

  return 'jpg';
};

const isEncryptedImageUrl = (url: string): boolean => {
  return /\.enc(\?|$)/.test(url);
};

const isTransientDecryptedImageUri = (uri: string): boolean => {
  if (typeof uri !== 'string') return false;
  if (!uri.startsWith('file://')) return false;
  return /\/decrypted_images\//.test(uri);
};

const getStoragePathFromUrl = (url: string): string | null => {
  if (!url) return null;

  if (url.startsWith('gs://')) {
    const withoutScheme = url.slice('gs://'.length);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash === -1) return null;
    return withoutScheme.slice(firstSlash + 1);
  }

  // Firebase download URL: .../o/{encodedPath}?alt=media&token=...
  const oMarker = '/o/';
  const oIndex = url.indexOf(oMarker);
  if (oIndex !== -1) {
    const encodedPathWithQuery = url.slice(oIndex + oMarker.length);
    const queryIndex = encodedPathWithQuery.indexOf('?');
    const encodedPath = queryIndex === -1
      ? encodedPathWithQuery
      : encodedPathWithQuery.slice(0, queryIndex);

    if (encodedPath) {
      try {
        return decodeURIComponent(encodedPath);
      } catch {
        return encodedPath;
      }
    }
  }

  // storage.googleapis.com/{bucket}/{path}
  const hostMarker = 'storage.googleapis.com/';
  const hostIndex = url.indexOf(hostMarker);
  if (hostIndex !== -1) {
    const afterHost = url.slice(hostIndex + hostMarker.length);
    const queryIndex = afterHost.indexOf('?');
    const pathWithBucket = queryIndex === -1 ? afterHost : afterHost.slice(0, queryIndex);
    const slashIndex = pathWithBucket.indexOf('/');
    if (slashIndex !== -1) {
      const encodedPath = pathWithBucket.slice(slashIndex + 1);
      try {
        return decodeURIComponent(encodedPath);
      } catch {
        return encodedPath;
      }
    }
  }

  return null;
};

const toStorageIdentity = (url: string): string => getStoragePathFromUrl(url) || url;

const getMediaUrlsFromEntryData = (entryData: any): string[] => {
  const images = Array.isArray(entryData?.images) ? entryData.images : [];
  const videos = Array.isArray(entryData?.videos) ? entryData.videos : [];
  const thumbnails = Object.values(entryData?.videoThumbnails || {}).filter(
    (value): value is string => typeof value === 'string'
  );

  return [...images, ...videos, ...thumbnails].filter((value): value is string => typeof value === 'string');
};

const getRemovedMediaUrls = (previousUrls: string[], nextUrls: string[]): string[] => {
  const nextIdentitySet = new Set(nextUrls.map(toStorageIdentity));

  return previousUrls.filter((url) => {
    const identity = toStorageIdentity(url);
    return !nextIdentitySet.has(identity);
  });
};

const deleteMediaUrlsBestEffort = async (urls: string[]): Promise<void> => {
  const uniquePaths = Array.from(
    new Set(
      urls
        .map((url) => getStoragePathFromUrl(url))
        .filter((path): path is string => Boolean(path))
    )
  );

  await Promise.all(
    uniquePaths.map(async (storagePath) => {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (error: any) {
        // Missing object is already effectively deleted.
        if (error?.code !== 'storage/object-not-found' && __DEV__) {
          console.warn('[deleteMediaUrlsBestEffort] Failed to delete storage object:', storagePath, error);
        }
      }
    })
  );
};

const fetchEncryptedImageBytes = async (imageUrl: string): Promise<Uint8Array> => {
  const storagePath = getStoragePathFromUrl(imageUrl);
  if (storagePath) {
    try {
      const encryptedBytes = await getBytes(ref(storage, storagePath));
      return encryptedBytes instanceof Uint8Array ? encryptedBytes : new Uint8Array(encryptedBytes);
    } catch {
      // Fallback to direct URL fetch below.
    }
  }

  try {
    const directResponse = await fetch(imageUrl);
    if (directResponse.ok) {
      return new Uint8Array(await directResponse.arrayBuffer());
    }
  } catch {
    // Fallback below.
  }

  throw new Error('Encrypted image download failed via both storage path and direct URL');
};

const LOCKED_ENTRY_TITLE = '🔒 Lukittu merkinta';
const LOCKED_ENTRY_CONTENT = 'Tata sisaltoa ei voi purkaa nykyisella salausavaimella.';

const looksEncryptedPayload = (value: string): boolean => {
  // secretbox payload + nonce is usually long base64 without whitespace
  return value.length > 40 && /^[A-Za-z0-9+/=]+$/.test(value);
};

const safeDecryptText = (value: unknown, encryptedFallback = ''): string => {
  if (typeof value !== 'string') return '';
  try {
    return decryptText(value);
  } catch {
    // Backward compatibility: if old plaintext data is incorrectly marked encrypted,
    // keep rendering plaintext instead of breaking the whole entry list.
    return looksEncryptedPayload(value) ? encryptedFallback : value;
  }
};

const getVideoThumbnailCachePath = (videoUrl: string): string => {
  const fileName = `${hashString(videoUrl)}.jpg`;
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

    await prewarmVideoThumbnailCache(videoUrl, videoUrl);
    return await getCachedVideoThumbnailUri(videoUrl);
  } catch (error) {
    return null;
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
  } catch (error) {
    // Thumbnail warmup is best-effort and must not fail upload.
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
  let generatedThumbnailUri: string | undefined;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      console.warn('[uploadVideoThumbnail] No auth token');
      return undefined;
    }

    const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
      console.warn('[uploadVideoThumbnail] No Firebase bucket');
      return undefined;
    }

    const generated = await VideoThumbnails.getThumbnailAsync(sourceUri, {
      time: 0,
      quality: 0.35,
    });

    if (!generated?.uri) {
      console.warn('[uploadVideoThumbnail] Failed to generate thumbnail');
      return undefined;
    }

    generatedThumbnailUri = generated.uri;

    const filename = `videos/${userId}/thumbnails/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const encodedFilename = encodeURIComponent(filename);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, generatedThumbnailUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
      },
    });

    if (!uploadResult || uploadResult.status < 200 || uploadResult.status >= 300) {
      console.warn('[uploadVideoThumbnail] Upload failed:', uploadResult?.status);
      return undefined;
    }

    const responseData = JSON.parse(uploadResult.body);
    const downloadToken = responseData.downloadTokens;
    if (!downloadToken) {
      console.warn('[uploadVideoThumbnail] No download token in response');
      return undefined;
    }

    const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedFilename}?alt=media&token=${downloadToken}`;
    return thumbnailUrl;
  } catch (error) {
    console.error('[uploadVideoThumbnail] Error:', error);
    return undefined;
  } finally {
    if (generatedThumbnailUri) {
      await FileSystem.deleteAsync(generatedThumbnailUri, { idempotent: true }).catch(() => undefined);
    }
  }
};

const decryptImageUrlToLocalUri = async (imageUrl: string): Promise<string> => {
  if (!isEncryptedImageUrl(imageUrl)) {
    return imageUrl;
  }

  try {
    await ensureDecryptedImageCacheDir();
    // Versioned cache key to avoid stale files created by older extension logic.
    const cacheKey = `${hashString(imageUrl)}_v2`;
    const inMemoryCachedPath = decryptedImagePathCache.get(cacheKey);
    if (inMemoryCachedPath) {
      const inMemoryInfo = await FileSystem.getInfoAsync(inMemoryCachedPath);
      if (inMemoryInfo.exists) {
        return inMemoryCachedPath;
      }
      decryptedImagePathCache.delete(cacheKey);
    }
    const possibleExtensions = ['jpg', 'png', 'gif', 'webp', 'heic', 'heif'];

    for (const ext of possibleExtensions) {
      const cachedPath = `${DECRYPTED_IMAGE_CACHE_DIR}${cacheKey}.${ext}`;
      const cachedInfo = await FileSystem.getInfoAsync(cachedPath);
      if (cachedInfo.exists) {
        decryptedImagePathCache.set(cacheKey, cachedPath);
        return cachedPath;
      }
    }

    const encryptedBytes = await fetchEncryptedImageBytes(imageUrl);
    const decryptedBytes = decryptBytes(encryptedBytes);

    const extension = inferImageExtension(decryptedBytes);
    const localPath = `${DECRYPTED_IMAGE_CACHE_DIR}${cacheKey}.${extension}`;

    await FileSystem.writeAsStringAsync(localPath, encodeBase64(decryptedBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    decryptedImagePathCache.set(cacheKey, localPath);

    return localPath;
  } catch (error) {
    if (__DEV__) {
      console.warn('[decryptImageUrlToLocalUri] Failed to decrypt image URL:', imageUrl, error);
    }
    return imageUrl;
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
    throw error;
  }
};

/**
 * Upload multiple images to Firebase Storage
 */
export const uploadImages = async (uris: string[], userId: string): Promise<string[]> => {
  // Lähetetään enintään 3 kuvaa rinnakkain muistinkäytön hallitsemiseksi.
  const CONCURRENCY = 3;
  const results: string[] = new Array(uris.length);

  for (let start = 0; start < uris.length; start += CONCURRENCY) {
    const batch = uris.slice(start, start + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((uri) => uploadImage(uri, userId)));
    for (let i = 0; i < batchResults.length; i++) {
      results[start + i] = batchResults[i];
    }
  }

  return results;
};

/**
 * Upload a video to Firebase Storage.
 * Video upload is plain binary upload with optional thumbnail generation.
 */
export const uploadVideo = async (
  uri: string,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<UploadedVideoAsset> => {
  try {
    const MAX_VIDEO_MB = 500;

    onProgress?.(0);

    // Check file size before uploading
    let sizeMB = 0;
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size !== undefined) {
      sizeMB = fileInfo.size / (1024 * 1024);
      if (sizeMB > MAX_VIDEO_MB) {
        throw new Error(`Video on liian suuri (${sizeMB.toFixed(0)} Mt). Maksimikoko on ${MAX_VIDEO_MB} Mt.`);
      }
    }

    // Get Firebase auth token for REST API call
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Ei kirjautumistietoja');

    const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) throw new Error('Firebase storage bucket puuttuu ympäristömuuttujista');


    const fileExt = 'mp4';
    const filename = `videos/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const encodedFilename = encodeURIComponent(filename);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    const uploadSourceUri = uri;

    const uploadInfo = await FileSystem.getInfoAsync(uploadSourceUri);

    let lastUploadLogProgress = -1;

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
          const combinedProgress = Math.min(99, uploadProgress);
          onProgress?.(combinedProgress);

          if (
            uploadProgress === 0 ||
            uploadProgress === 100 ||
            uploadProgress - lastUploadLogProgress >= 10
          ) {
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

    await prewarmVideoThumbnailCache(downloadUrl, uri);
    const thumbnailUrl = await uploadVideoThumbnail(uri, userId);

    onProgress?.(100);

    return {
      videoUrl: downloadUrl,
      thumbnailUrl,
    };
  } catch (error) {
    throw error;
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
  const results: UploadedVideoAsset[] = [];

  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index];
    const uploaded = await uploadVideo(uri, userId, (progress) => {
      // Sequential upload keeps memory usage stable while still reporting aggregate progress.
      const combinedProgress = Math.round(
        ((index + progress / 100) / Math.max(uris.length, 1)) * 100
      );
      onProgress?.(combinedProgress);
    });
    results.push(uploaded);
  }

  onProgress?.(100);
  return results;
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

    debugLog('[createEntry] Saving entry:', {
      videoCount: docData.videos.length,
      thumbnailCount: Object.keys(docData.videoThumbnails).length,
      imageCount: docData.images.length,
    });

    const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), docData);
    debugLog('[createEntry] Entry saved successfully:', docRef.id);

    return docRef.id;
  } catch (error) {
    console.error('[createEntry] Error saving entry:', error);
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
    const needsMediaCleanup =
      updates.images !== undefined ||
      updates.videos !== undefined ||
      updates.videoThumbnails !== undefined;

    let currentData: any = null;
    if (needsMediaCleanup || updates.images !== undefined) {
      const currentSnap = await getDoc(entryRef);
      currentData = currentSnap.exists() ? currentSnap.data() : {};
    }

    // Poista undefined-arvot (Firestore ei hyväksy niitä)
    const cleanedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    ) as Partial<DiaryEntry>;

    // Salaa päivitettävät tekstikentät
    const encryptedUpdates: any = { ...cleanedUpdates, updatedAt: Timestamp.now() };

    if (updates.images !== undefined) {
      const nextImages = (updates.images || []).filter((uri) => !isTransientDecryptedImageUri(uri));

      if (nextImages.length === (updates.images || []).length) {
        encryptedUpdates.images = updates.images;
      } else {
        // Do not allow local cache file paths to overwrite persisted image references.
        if (nextImages.length > 0) {
          encryptedUpdates.images = nextImages;
        } else {
          encryptedUpdates.images = currentData?.images || [];
        }

        if (__DEV__) {
          console.warn('[updateEntry] Filtered transient decrypted image URIs from update payload');
        }
      }
    }
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
    // Do not force _encrypted=true on layout-only/metadata updates.
    // Older plaintext entries must not be re-labeled as encrypted accidentally.
    if (
      updates.title !== undefined ||
      updates.content !== undefined ||
      updates.location?.address !== undefined
    ) {
      encryptedUpdates._encrypted = true;
    }

    debugLog('[updateEntry] Updating entry:', {
      id,
      videoCount: updates.videos?.length || 0,
      thumbnailCount: Object.keys(updates.videoThumbnails || {}).length,
      fields: Object.keys(encryptedUpdates),
    });

    await updateDoc(entryRef, encryptedUpdates);

    if (needsMediaCleanup) {
      const previousUrls = getMediaUrlsFromEntryData(currentData || {});
      const nextUrls = getMediaUrlsFromEntryData({
        ...currentData,
        ...encryptedUpdates,
      });
      const removedUrls = getRemovedMediaUrls(previousUrls, nextUrls);
      await deleteMediaUrlsBestEffort(removedUrls);
    }

    debugLog('[updateEntry] Entry updated successfully:', id);
  } catch (error) {
    console.error('[updateEntry] Error updating entry:', error);
    throw error;
  }
};

/**
 * Delete a diary entry
 */
export const deleteEntry = async (id: string): Promise<void> => {
  try {
    const entryRef = doc(db, ENTRIES_COLLECTION, id);
    const entrySnap = await getDoc(entryRef);
    const entryData = entrySnap.exists() ? entrySnap.data() : null;

    await deleteDoc(entryRef);

    if (entryData) {
      const mediaUrls = getMediaUrlsFromEntryData(entryData);
      await deleteMediaUrlsBestEffort(mediaUrls);
    }
  } catch (error) {
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
        const title = isEncrypted ? safeDecryptText(data.title, LOCKED_ENTRY_TITLE) : data.title;
        const content = isEncrypted ? safeDecryptText(data.content, LOCKED_ENTRY_CONTENT) : data.content;
        const address = data.location?.address
          ? isEncrypted
            ? safeDecryptText(data.location.address)
            : data.location.address
          : undefined;

        const decryptedImages = await Promise.all(
          (data.images || []).map((imageUrl: string) => decryptImageUrlToLocalUri(imageUrl))
        );
        
        debugLog('[getEntries] Retrieved entry:', {
          id: docSnap.id,
          videoCount: (data.videos || []).length,
          thumbnailCount: Object.keys(data.videoThumbnails || {}).length,
          imageCount: decryptedImages.length,
        });
        
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

      const title = isEncrypted ? safeDecryptText(data.title, LOCKED_ENTRY_TITLE) : data.title;
      const content = isEncrypted ? safeDecryptText(data.content, LOCKED_ENTRY_CONTENT) : data.content;
      const address = data.location?.address
        ? isEncrypted
          ? safeDecryptText(data.location.address)
          : data.location.address
        : undefined;

      if (__DEV__ && (data.videos || []).length > 0) {
        debugLog('[getEntriesFast] Retrieved entry with videos:', {
          id: docSnap.id,
          videoCount: data.videos.length,
          thumbnailCount: Object.keys(data.videoThumbnails || {}).length,
        });
      }

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
 * Purkaa yhden merkinnän kuvat paikallisiksi URI:eiksi.
 */
export const resolveEntryMediaUris = async (entry: DiaryEntry): Promise<DiaryEntry> => {
  const decryptedImages = await Promise.all(
    (entry.images || []).map((imageUrl) => decryptImageUrlToLocalUri(imageUrl))
  );

  return {
    ...entry,
    images: decryptedImages,
  };
};

/** Palauttaa videon URI:n suoraan, koska videot eivät enää käytä E2E-salausta. */
export const resolveVideoUriForPlayback = async (videoUri: string): Promise<string> => {
  return videoUri;
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

        const title = isEncrypted ? safeDecryptText(data.title, LOCKED_ENTRY_TITLE) : data.title;
        const content = isEncrypted ? safeDecryptText(data.content, LOCKED_ENTRY_CONTENT) : data.content;
        const address = data.location?.address
          ? isEncrypted
            ? safeDecryptText(data.location.address)
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
    userProfileCache.set(userId, {
      data: { photoURL },
      expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get user profile
 */
export const getUserProfile = async (
  userId: string
): Promise<UserProfileData | null> => {
  try {
    const cached = userProfileCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data() as {
        photoURL?: string;
        displayName?: string;
        firstName?: string;
        lastName?: string;
      };
      userProfileCache.set(userId, {
        data,
        expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
      });
      return data;
    }

    userProfileCache.set(userId, {
      data: null,
      expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
    });
    return null;
  } catch (error) {
    throw error;
  }
};
