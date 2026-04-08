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
import * as FileSystem from 'expo-file-system/legacy';
import { auth, db } from './firebase';
import { Document } from '../types/Document';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { encryptText, decryptText, encryptBytes, decryptBytes } from './encryptionService';

const DOCUMENTS_COLLECTION = 'documents';
const DECRYPTED_DOCUMENT_CACHE_DIR = `${FileSystem.cacheDirectory}decrypted_documents/`;

const ensureDecryptedDocumentCacheDir = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(DECRYPTED_DOCUMENT_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DECRYPTED_DOCUMENT_CACHE_DIR, { intermediates: true });
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

export const isEncryptedDocumentUrl = (url: string): boolean => /\.enc(\?|$)/.test(url);

const sanitizeExt = (ext: string): string => ext.toLowerCase().replace(/[^a-z0-9]/g, '');

const getExtensionFromFileName = (fileName: string): string | null => {
  const nameOnly = fileName.split('?')[0];
  const lastDot = nameOnly.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = sanitizeExt(nameOnly.slice(lastDot + 1));
  return ext || null;
};

const getFallbackExtensionByType = (fileType: string): string => {
  if (fileType === 'image') return 'jpg';
  if (fileType === 'pdf') return 'pdf';
  if (fileType === 'docx') return 'docx';
  return 'bin';
};

const resolveExtension = (fileName: string, fileType: string): string =>
  getExtensionFromFileName(fileName) ?? getFallbackExtensionByType(fileType);

export const getDecryptedDocumentUri = async (
  fileUrl: string,
  fileName: string,
  fileType: string
): Promise<string> => {
  if (!isEncryptedDocumentUrl(fileUrl)) {
    return fileUrl;
  }

  try {
    await ensureDecryptedDocumentCacheDir();
    const extension = resolveExtension(fileName, fileType);
    const localPath = `${DECRYPTED_DOCUMENT_CACHE_DIR}${hashString(fileUrl)}.${extension}`;

    const localInfo = await FileSystem.getInfoAsync(localPath);
    if (localInfo.exists) {
      return localPath;
    }

    const response = await fetch(fileUrl);
    const encryptedBuffer = await response.arrayBuffer();
    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const decryptedBytes = decryptBytes(encryptedBytes);

    await FileSystem.writeAsStringAsync(localPath, encodeBase64(decryptedBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });

    return localPath;
  } catch (error) {
    console.error('Error decrypting document file:', error);
    return fileUrl;
  }
};

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

    const extension = resolveExtension(fileName, fileType);
    const filename = `documents/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}.enc`;
    const encodedFilename = encodeURIComponent(filename);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedFilename}`;

    const tempFilePath = `${FileSystem.cacheDirectory}enc_doc_${Date.now()}_${Math.random().toString(36).slice(2)}.enc`;
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
      throw new Error(`Dokumentin upload epäonnistui (status ${result?.status}): ${result?.body}`);
    }

    const responseData = JSON.parse(result.body);
    const downloadToken = responseData.downloadTokens;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedFilename}?alt=media&token=${downloadToken}`;

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
      title: encryptText(document.title),          // Salattu
      category: document.category,
      fileUrl: document.fileUrl,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      date: Timestamp.fromDate(document.date),
      tags: document.tags,
      _encrypted: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Only add optional fields if they have values
    if (document.description) {
      docData.description = encryptText(document.description); // Salattu
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
      const isEncrypted = data._encrypted === true;

      documents.push({
        id: doc.id,
        userId: data.userId,
        title: isEncrypted ? decryptText(data.title) : data.title,
        description: data.description
          ? isEncrypted ? decryptText(data.description) : data.description
          : undefined,
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
