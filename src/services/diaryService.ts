import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { DiaryEntry } from '../types/DiaryEntry';

const ENTRIES_COLLECTION = 'diary_entries';

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
        date: data.date.toDate(),
        location: data.location,
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
        date: data.date.toDate(),
        location: data.location,
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
