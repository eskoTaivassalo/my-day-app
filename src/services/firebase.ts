import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, Auth } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBNWFk0tOi-230CIdFnz270fNmslQKx42A",
  authDomain: "my-day-31963.firebaseapp.com",
  projectId: "my-day-31963",
  storageBucket: "my-day-31963.firebasestorage.app",
  messagingSenderId: "616626279972",
  appId: "1:616626279972:web:e6ab1b8945a0c43c9beab1",
  measurementId: "G-XKY9J38RY6"
};

// Initialize Firebase (prevent multiple initializations)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth - getAuth() automatically handles persistence in React Native
const auth: Auth = getAuth(app);

// Initialize services
export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
