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
import { Document } from '../types/Document';

const DOCUMENTS_COLLECTION = 'documents';

/**
 * Upload document file to Firebase Storage
 */
export const uploadDocumentFile = async (
  uri: string,
  userId: string,
  fileName: string,
  fileType: string
): Promise<string> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const extension = fileType === 'image' ? 'jpg' : fileType;
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
    const storageRef = ref(storage, `documents/${filename}`);

    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

    return downloadUrl;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
};

/**
 * Create a new document
 */
export const createDocument = async (
  document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<string> => {
  try {
    // Remove undefined values to avoid Firestore errors
    const docData: any = {
      userId,
      title: document.title,
      category: document.category,
      fileUrl: document.fileUrl,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      date: Timestamp.fromDate(document.date),
      tags: document.tags,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Only add optional fields if they have values
    if (document.description) {
      docData.description = document.description;
    }
    if (document.thumbnailUrl) {
      docData.thumbnailUrl = document.thumbnailUrl;
    }

    const docRef = await addDoc(collection(db, DOCUMENTS_COLLECTION), docData);

    return docRef.id;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
};

/**
 * Get all documents for a user
 */
export const getDocuments = async (userId: string): Promise<Document[]> => {
  try {
    const q = query(
      collection(db, DOCUMENTS_COLLECTION),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const documents: Document[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      documents.push({
        id: doc.id,
        userId: data.userId,
        title: data.title,
        description: data.description,
        category: data.category,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        thumbnailUrl: data.thumbnailUrl,
        date: data.date.toDate(),
        tags: data.tags || [],
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      });
    });

    return documents;
  } catch (error) {
    console.error('Error getting documents:', error);
    throw error;
  }
};

/**
 * Update a document
 */
export const updateDocument = async (
  documentId: string,
  updates: Partial<Omit<Document, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<void> => {
  try {
    const docRef = doc(db, DOCUMENTS_COLLECTION, documentId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
};

/**
 * Delete a document
 */
export const deleteDocument = async (documentId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, DOCUMENTS_COLLECTION, documentId));
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
};

/**
 * Search documents by title, description, or tags
 */
export const searchDocuments = async (userId: string, searchTerm: string): Promise<Document[]> => {
  try {
    const allDocs = await getDocuments(userId);
    const lowerSearch = searchTerm.toLowerCase();
    
    return allDocs.filter(doc => 
      doc.title.toLowerCase().includes(lowerSearch) ||
      doc.description?.toLowerCase().includes(lowerSearch) ||
      doc.tags.some(tag => tag.toLowerCase().includes(lowerSearch))
    );
  } catch (error) {
    console.error('Error searching documents:', error);
    throw error;
  }
};
