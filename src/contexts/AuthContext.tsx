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
import { collection, query, where, getDocs, deleteDoc, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { auth, db, storage } from '../services/firebase';
import {
  tryLoadKeyFromDevice,
  setupNewEncryptionKey,
  loadEncryptionKey,
  rewrapEncryptionKey,
  clearEncryptionKey,
  deleteEncryptionKey,
  getEncryptionStatus,
} from '../services/encryptionService';

WebBrowser.maybeCompleteAuthSession();

const AUTH_USER_KEY = '@my_day_auth_user';

// Lippu joka estää onAuthStateChanged:ia häiritsemästä aktiivista kirjautumista
let _activeSignInInProgress = false;

export type EncryptionStatus = 'loading' | 'ready' | 'needs_setup' | 'needs_passphrase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  encryptionStatus: EncryptionStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  setupEncryption: (passphrase: string) => Promise<void>;
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  changeEncryptionPassphrase: (newPassphrase: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus>('loading');

  useEffect(() => {
    console.log('🔐 [AuthContext] Initializing auth...');
    let isMounted = true;

    // Try to restore user from AsyncStorage first
    const restoreUser = async () => {
      try {
        const savedUser = await AsyncStorage.getItem(AUTH_USER_KEY);
        if (savedUser && isMounted) {
          console.log('🔐 [AuthContext] Found saved user in AsyncStorage');
          // User restored
        }
      } catch (error) {
        console.error('❌ [AuthContext] Error restoring user:', error);
      }
    };

    restoreUser();

    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;
      
      console.log(`🔐 [AuthContext] Auth state changed: ${firebaseUser ? `logged in as ${firebaseUser.email}` : 'logged out'}`);
      setUser(firebaseUser);
      setLoading(false);

      // Save/remove user in AsyncStorage
      try {
        if (firebaseUser) {
          console.log(`🔐 [AuthContext] Saving user to AsyncStorage: ${firebaseUser.email}`);
          await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          }));
        } else {
          await AsyncStorage.removeItem(AUTH_USER_KEY);
        }
      } catch (error) {
        console.error('Error saving user to AsyncStorage:', error);
      }

      // Varmista että kirjautuneella käyttäjällä on Firestore-dokumentti
      // (kattaa vanhat käyttäjät jotka rekisteröityivät ennen tätä logiikkaa)
      if (firebaseUser) {
        // Jos aktiivinen kirjautuminen on käynnissä (signIn/signUp/Google),
        // se hoitaa salausavaimen lataamisen — ei tehdä tässä päällekkäin
        if (_activeSignInInProgress) return;

        // Sovelluksen uudelleenkäynnistys: yritä ladata avain laitteesta
        try {
          const loaded = await tryLoadKeyFromDevice(firebaseUser.uid);
          if (loaded) {
            setEncryptionStatus('ready');
          } else {
            // Uusi laite tai SecureStore tyhjennetty — tarkista onko avain Firestoressa
            const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (snap.exists() && snap.data().encryptedMasterKey) {
              setEncryptionStatus('needs_passphrase');
            } else {
              setEncryptionStatus('needs_setup');
            }
          }
        } catch (error) {
          console.error('Error loading encryption key on restart:', error);
          setEncryptionStatus('needs_passphrase');
        }

        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName ?? null,
              photoURL: firebaseUser.photoURL ?? null,
              provider: firebaseUser.providerData?.[0]?.providerId ?? 'email',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          }
        } catch (error) {
          console.error('Error ensuring user document:', error);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      _activeSignInInProgress = true;
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Lataa salausavain — sähköpostisalasana = päiväkirjan salafraasi
      const result = await loadEncryptionKey(cred.user.uid, password);
      if (result === 'setup_needed') {
        // Uusi käyttäjä tai migraatio vanhasta versiosta
        await setupNewEncryptionKey(cred.user.uid, password);
      } else if (result === 'wrong_passphrase') {
        // Ei pitäisi tapahtua jos sähköpostikirjautuminen onnistui samalla salasanalla
        setEncryptionStatus('needs_passphrase');
      }
      if (getEncryptionStatus().isReady) {
        setEncryptionStatus('ready');
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw new Error(error.message);
    } finally {
      _activeSignInInProgress = false;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      _activeSignInInProgress = true;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      // Luo users-dokumentti Firestoreen heti rekisteröinnin yhteydessä
      await setDoc(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName ?? null,
        photoURL: null,
        provider: 'email',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      // Aseta salaus — sähköpostisalasana = päiväkirjan salafraasi
      await setupNewEncryptionKey(credential.user.uid, password);
      setEncryptionStatus('ready');
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw new Error(error.message);
    } finally {
      _activeSignInInProgress = false;
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
          _activeSignInInProgress = true;
          const credential = GoogleAuthProvider.credential(idToken);
          const userCredential = await signInWithCredential(auth, credential);
          // Luo users-dokumentti Firestoreen jos ei vielä ole (uusi Google-käyttäjä)
          const userRef = doc(db, 'users', userCredential.user.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: userCredential.user.uid,
              email: userCredential.user.email,
              displayName: userCredential.user.displayName ?? null,
              photoURL: userCredential.user.photoURL ?? null,
              provider: 'google',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          }
          // Yritä ladata avain laitteen SecureStoresta
          const loaded = await tryLoadKeyFromDevice(userCredential.user.uid);
          if (loaded) {
            setEncryptionStatus('ready');
          } else if (userSnap.exists() && userSnap.data().encryptedMasterKey) {
            setEncryptionStatus('needs_passphrase');
          } else {
            setEncryptionStatus('needs_setup');
          }
        } else {
          throw new Error('No ID token found');
        }
      } else {
        throw new Error('Authentication cancelled or failed');
      }
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      throw new Error(error.message);
    } finally {
      _activeSignInInProgress = false;
    }
  };

  /** Google-käyttäjät: asettaa päiväkirjan salafraasin ensimmäisen kirjautumisen jälkeen. */
  const setupEncryption = async (passphrase: string): Promise<void> => {
    if (!auth.currentUser) throw new Error('Ei kirjautunutta käyttäjää');
    await setupNewEncryptionKey(auth.currentUser.uid, passphrase);
    setEncryptionStatus('ready');
  };

  /** Avaa salauksen salafraasin avulla (uusi laite tai SecureStore tyhjennetty). */
  const unlockWithPassphrase = async (passphrase: string): Promise<boolean> => {
    if (!auth.currentUser) return false;
    const result = await loadEncryptionKey(auth.currentUser.uid, passphrase);
    if (result === 'ready') {
      setEncryptionStatus('ready');
      return true;
    }
    return false;
  };

  /** Vaihtaa salafraasin ilman datan uudelleensalausta (masterKey pysyy samana). */
  const changeEncryptionPassphrase = async (newPassphrase: string): Promise<void> => {
    if (!auth.currentUser) throw new Error('Ei kirjautunutta käyttäjää');
    await rewrapEncryptionKey(auth.currentUser.uid, newPassphrase);
  };

  const logout = async () => {
    try {
      clearEncryptionKey();
      setEncryptionStatus('loading');
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

      // 1. Poista kaikki diary_entries
      const entriesQuery = query(
        collection(db, 'diary_entries'),
        where('userId', '==', userId)
      );
      const entriesSnapshot = await getDocs(entriesQuery);
      const entryDeletePromises = entriesSnapshot.docs.map((docSnap) =>
        deleteDoc(doc(db, 'diary_entries', docSnap.id))
      );
      await Promise.all(entryDeletePromises);

      // 2. Poista kaikki documents
      const documentsQuery = query(
        collection(db, 'documents'),
        where('userId', '==', userId)
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documentDeletePromises = documentsSnapshot.docs.map((docSnap) =>
        deleteDoc(doc(db, 'documents', docSnap.id))
      );
      await Promise.all(documentDeletePromises);

      // 3. Poista käyttäjän profiili users-kokoelmasta
      try {
        await deleteDoc(doc(db, 'users', userId));
      } catch (error) {
        // Ei käyttäjäprofiilia poistettavaksi
      }

      // 4. Poista kuvat Storage:sta
      try {
        const userImagesRef = ref(storage, `images/${userId}`);
        const imagesList = await listAll(userImagesRef);
        const imageDeletePromises = imagesList.items.map((itemRef) =>
          deleteObject(itemRef)
        );
        await Promise.all(imageDeletePromises);
      } catch (error) {
        // Ei kuvia poistettavaksi
      }

      // 5. Poista dokumentit Storage:sta
      try {
        const userDocsRef = ref(storage, `documents/${userId}`);
        const docsList = await listAll(userDocsRef);
        const docDeletePromises = docsList.items.map((itemRef) =>
          deleteObject(itemRef)
        );
        await Promise.all(docDeletePromises);
      } catch (error) {
        // Ei tiedostoja poistettavaksi
      }

      // 6. Poista käyttäjätili Authentication:sta
      await deleteUser(currentUser);

      // 7. Poista salausavain laitteelta (data on pysyvästi menetetty tämän jälkeen)
      await deleteEncryptionKey(userId);

      // 8. Tyhjennä AsyncStorage
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
        encryptionStatus,
        signIn,
        signUp,
        signInWithGoogle,
        setupEncryption,
        unlockWithPassphrase,
        changeEncryptionPassphrase,
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
