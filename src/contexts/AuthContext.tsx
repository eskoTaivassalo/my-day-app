import React, { createContext, useState, useContext, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithCredential,
  deleteUser,
} from 'firebase/auth';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { auth, db, storage } from '../services/firebase';

WebBrowser.maybeCompleteAuthSession();

const AUTH_USER_KEY = '@my_day_auth_user';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Try to restore user from AsyncStorage first
    const restoreUser = async () => {
      try {
        const savedUser = await AsyncStorage.getItem(AUTH_USER_KEY);
        if (savedUser && isMounted) {
          console.log('Restored user from AsyncStorage');
        }
      } catch (error) {
        console.error('Error restoring user:', error);
      }
    };

    restoreUser();

    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      console.log('Auth state changed:', firebaseUser ? 'logged in' : 'logged out');
      
      setUser(firebaseUser);
      setLoading(false);

      // Save/remove user in AsyncStorage
      try {
        if (firebaseUser) {
          await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          }));
          console.log('User saved to AsyncStorage');
        } else {
          await AsyncStorage.removeItem(AUTH_USER_KEY);
          console.log('User removed from AsyncStorage');
        }
      } catch (error) {
        console.error('Error saving user to AsyncStorage:', error);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw new Error(error.message);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw new Error(error.message);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      if (!clientId) {
        throw new Error('Google Web Client ID not configured');
      }

      const redirectUri = AuthSession.makeRedirectUri();

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=id_token&` +
        `scope=openid%20profile%20email&` +
        `nonce=${Math.random().toString(36)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success') {
        const { url } = result;
        const idToken = url.split('id_token=')[1]?.split('&')[0];

        if (idToken) {
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
        } else {
          throw new Error('No ID token found');
        }
      } else {
        throw new Error('Authentication cancelled or failed');
      }
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      throw new Error(error.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error('Logout error:', error);
      throw new Error(error.message);
    }
  };

  const deleteAccount = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Ei kirjautunutta käyttäjää');
      }

      const userId = currentUser.uid;
      console.log('Aloitetaan tilin poisto käyttäjälle:', userId);

      // 1. Poista kaikki diary_entries
      console.log('Poistetaan päiväkirjamerkinnät...');
      const entriesQuery = query(
        collection(db, 'diary_entries'),
        where('userId', '==', userId)
      );
      const entriesSnapshot = await getDocs(entriesQuery);
      const entryDeletePromises = entriesSnapshot.docs.map((docSnap) =>
        deleteDoc(doc(db, 'diary_entries', docSnap.id))
      );
      await Promise.all(entryDeletePromises);
      console.log(`Poistettu ${entriesSnapshot.size} päiväkirjamerkintää`);

      // 2. Poista kaikki documents
      console.log('Poistetaan dokumentit...');
      const documentsQuery = query(
        collection(db, 'documents'),
        where('userId', '==', userId)
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documentDeletePromises = documentsSnapshot.docs.map((docSnap) =>
        deleteDoc(doc(db, 'documents', docSnap.id))
      );
      await Promise.all(documentDeletePromises);
      console.log(`Poistettu ${documentsSnapshot.size} dokumenttia`);

      // 3. Poista käyttäjän profiili users-kokoelmasta
      console.log('Poistetaan käyttäjäprofiili...');
      try {
        await deleteDoc(doc(db, 'users', userId));
        console.log('Käyttäjäprofiili poistettu');
      } catch (error) {
        console.log('Ei käyttäjäprofiilia poistettavaksi');
      }

      // 4. Poista kuvat Storage:sta
      console.log('Poistetaan kuvat...');
      try {
        const userImagesRef = ref(storage, `images/${userId}`);
        const imagesList = await listAll(userImagesRef);
        const imageDeletePromises = imagesList.items.map((itemRef) =>
          deleteObject(itemRef)
        );
        await Promise.all(imageDeletePromises);
        console.log(`Poistettu ${imagesList.items.length} kuvaa`);
      } catch (error) {
        console.log('Ei kuvia poistettavaksi tai virhe:', error);
      }

      // 5. Poista dokumentit Storage:sta
      console.log('Poistetaan tallennetut dokumentit...');
      try {
        const userDocsRef = ref(storage, `documents/${userId}`);
        const docsList = await listAll(userDocsRef);
        const docDeletePromises = docsList.items.map((itemRef) =>
          deleteObject(itemRef)
        );
        await Promise.all(docDeletePromises);
        console.log(`Poistettu ${docsList.items.length} tiedostoa`);
      } catch (error) {
        console.log('Ei tiedostoja poistettavaksi tai virhe:', error);
      }

      // 6. Poista käyttäjätili Authentication:sta
      console.log('Poistetaan käyttäjätili...');
      await deleteUser(currentUser);
      console.log('Käyttäjätili poistettu onnistuneesti');

      // 7. Tyhjennä AsyncStorage
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    } catch (error: any) {
      console.error('Tilin poisto virhe:', error);
      throw new Error(error.message);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        logout,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
