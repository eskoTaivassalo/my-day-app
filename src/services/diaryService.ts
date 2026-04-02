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
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { auth, db, storage } from './firebase';
import { DiaryEntry } from '../types/DiaryEntry';

const ENTRIES_COLLECTION = 'diary_entries';
const USERS_COLLECTION = 'users';

/**
 * Upload an image to Firebase Storage
 */
export const uploadImage = async (uri: string, userId: string): Promise<string> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const storageRef = ref(storage, `images/${filename}`);

    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

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
 * Uses FileSystem.createUploadTask which streams the file directly from disk
 * without loading it into JS memory — required for large videos.
 */
export const uploadVideo = async (
  uri: string,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    // Check file size before uploading (max 500 MB)
    const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size !== undefined) {
      const sizeMB = fileInfo.size / (1024 * 1024);
      if (sizeMB > 500) {
        throw new Error(`Video on liian suuri (${sizeMB.toFixed(0)} Mt). Maksimikoko on 500 Mt.`);
      }
    }

    // Get Firebase auth token for REST API call
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Ei kirjautumistietoja');

    const filename = `videos/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
    const encodedFilename = encodeURIComponent(filename);
    const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    // FileSystem.createUploadTask streams from disk — never loads full file into memory
    const task = FileSystem.createUploadTask(
      uploadUrl,
      uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'video/mp4',
        },
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0) {
          onProgress?.(Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100));
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

    return downloadUrl;
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};

/**
 * Upload multiple videos to Firebase Storage
 */
export const uploadVideos = async (uris: string[], userId: string): Promise<string[]> => {
  const uploadPromises = uris.map((uri) => uploadVideo(uri, userId));
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
    const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), {
      ...entry,
      userId,
      date: Timestamp.fromDate(entry.date),
      videos: entry.videos || [],
      createdAt: now,
      updatedAt: now,
    });

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
    await updateDoc(entryRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
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
    const entries: DiaryEntry[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      entries.push({
        id: doc.id,
        title: data.title,
        content: data.content,
        images: data.images || [],
        videos: data.videos || [],
        date: data.date.toDate(),
        location: data.location,
        shared: data.shared || false,
        // Layout settings
        layout: data.layout,
        textPosition: data.textPosition,
        imageShape: data.imageShape,
        textOverlay: data.textOverlay,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      });
    });

    return entries;
  } catch (error) {
    console.error('Error getting entries:', error);
    throw error;
  }
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
    const entries: DiaryEntry[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      entries.push({
        id: doc.id,
        title: data.title,
        content: data.content,
        images: data.images || [],
        videos: data.videos || [],
        date: data.date.toDate(),
        location: data.location,
        shared: data.shared || false,
        // Layout settings
        layout: data.layout,
        textPosition: data.textPosition,
        imageShape: data.imageShape,
        textOverlay: data.textOverlay,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      });
    });

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
