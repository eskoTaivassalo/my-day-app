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

const isEncryptedImageUrl = (url: string): boolean => {
  return /\.enc(\?|$)/.test(url);
};

const safeDecryptText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  try {
    return decryptText(value);
  } catch {
    // Backward compatibility: if old plaintext data is incorrectly marked encrypted,
    // keep rendering plaintext instead of breaking the whole entry list.
    return value;
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

    console.log('[uploadVideoThumbnail] Generating thumbnail from:', sourceUri);
    const generated = await VideoThumbnails.getThumbnailAsync(sourceUri, {
      time: 0,
      quality: 0.35,
    });

    if (!generated?.uri) {
      console.warn('[uploadVideoThumbnail] Failed to generate thumbnail');
      return undefined;
    }

    generatedThumbnailUri = generated.uri;
    console.log('[uploadVideoThumbnail] Thumbnail generated:', generatedThumbnailUri);

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
    console.log('[uploadVideoThumbnail] Thumbnail uploaded successfully:', thumbnailUrl);
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
  const uploaded: string[] = [];

  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index];
    const uploadedUrl = await uploadImage(uri, userId);
    uploaded.push(uploadedUrl);
  }

  return uploaded;
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

    console.log('[createEntry] Saving entry:', {
      videoCount: docData.videos.length,
      thumbnailCount: Object.keys(docData.videoThumbnails).length,
      imageCount: docData.images.length,
    });

    const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), docData);
    console.log('[createEntry] Entry saved successfully:', docRef.id);

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
    // Do not force _encrypted=true on layout-only/metadata updates.
    // Older plaintext entries must not be re-labeled as encrypted accidentally.
    if (
      updates.title !== undefined ||
      updates.content !== undefined ||
      updates.location?.address !== undefined
    ) {
      encryptedUpdates._encrypted = true;
    }

    console.log('[updateEntry] Updating entry:', {
      id,
      videoCount: updates.videos?.length || 0,
      thumbnailCount: Object.keys(updates.videoThumbnails || {}).length,
      fields: Object.keys(encryptedUpdates),
    });

    await updateDoc(entryRef, encryptedUpdates);
    console.log('[updateEntry] Entry updated successfully:', id);
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
    await deleteDoc(entryRef);
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
        const title = isEncrypted ? safeDecryptText(data.title) : data.title;
        const content = isEncrypted ? safeDecryptText(data.content) : data.content;
        const address = data.location?.address
          ? isEncrypted
            ? safeDecryptText(data.location.address)
            : data.location.address
          : undefined;

        const decryptedImages = await Promise.all(
          (data.images || []).map((imageUrl: string) => decryptImageUrlToLocalUri(imageUrl))
        );
        
        console.log('[getEntries] Retrieved entry:', {
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

      const title = isEncrypted ? safeDecryptText(data.title) : data.title;
      const content = isEncrypted ? safeDecryptText(data.content) : data.content;
      const address = data.location?.address
        ? isEncrypted
          ? safeDecryptText(data.location.address)
          : data.location.address
        : undefined;

      if ((data.videos || []).length > 0) {
        console.log('[getEntriesFast] Retrieved entry with videos:', {
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

        const title = isEncrypted ? safeDecryptText(data.title) : data.title;
        const content = isEncrypted ? safeDecryptText(data.content) : data.content;
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
  } catch (error) {
    throw error;
  }
};

/**
 * Get user profile
 */
export const getUserProfile = async (
  userId: string
): Promise<{
  photoURL?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
} | null> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data() as {
        photoURL?: string;
        displayName?: string;
        firstName?: string;
        lastName?: string;
      };
    }
    return null;
  } catch (error) {
    throw error;
  }
};
