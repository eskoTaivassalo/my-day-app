import React, { createContext, useState, useContext, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { collection, query, where, getDocs, deleteDoc, doc, setDoc, getDoc, Timestamp, limit } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, storage } from '../services/firebase';
import {
  tryLoadKeyFromDevice,
  setupNewEncryptionKey,
  loadEncryptionKey,
  loadEncryptionKeyWithRecoveryKey,
  createRecoveryKey,
  rewrapEncryptionKey,
  clearEncryptionKey,
  deleteEncryptionKey,
  getEncryptionStatus,
} from '../services/encryptionService';

const AUTH_USER_KEY = '@my_day_auth_user';

// Lippu joka estää onAuthStateChanged:ia häiritsemästä aktiivista kirjautumista
let _activeSignInInProgress = false;
let _lastEmailSignInPassword: string | null = null;

export type EncryptionStatus = 'loading' | 'ready' | 'needs_setup' | 'needs_passphrase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  encryptionStatus: EncryptionStatus;
  encryptionRevision: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendResetPasswordEmail: (email: string) => Promise<void>;
  setupEncryption: (passphrase: string) => Promise<void>;
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  unlockWithRecoveryKey: (recoveryKey: string) => Promise<boolean>;
  changeEncryptionPassphrase: (newPassphrase: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  generateRecoveryKey: () => Promise<string>;
  resetEncryptionWithPassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ensureUserDocument = async (firebaseUser: User): Promise<void> => {
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
};

const hasExistingEncryptedContent = async (userId: string): Promise<boolean> => {
  const [entrySnap, documentSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'diary_entries'),
        where('userId', '==', userId),
        where('_encrypted', '==', true),
        limit(1)
      )
    ),
    getDocs(
      query(
        collection(db, 'documents'),
        where('userId', '==', userId),
        where('_encrypted', '==', true),
        limit(1)
      )
    ),
  ]);

  return !entrySnap.empty || !documentSnap.empty;
};

const unlockEncryptionWithPassword = async (userId: string, password: string): Promise<'ready' | 'initialized'> => {
  const result = await loadEncryptionKey(userId, password);

  if (result === 'ready') {
    return 'ready';
  }

  if (result === 'wrong_passphrase') {
    throw new Error('Kirjautuminen onnistui, mutta vanhojen merkintöjen salauksen avaus epäonnistui tällä salasanalla. Sovellus ei luonut uutta avainta vanhan päälle.');
  }

  const hasEncryptedContent = await hasExistingEncryptedContent(userId);
  if (hasEncryptedContent) {
    throw new Error('Tililtä löytyi aiemmin salattua sisältöä, mutta salausavainta ei löytynyt käyttäjäprofiilista. Vanhaa avainta ei ylikirjoitettu.');
  }

  await setupNewEncryptionKey(userId, password);
  return 'initialized';
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus>('loading');
  const [encryptionRevision, setEncryptionRevision] = useState(0);

  useEffect(() => {
    let isMounted = true;

    // Try to restore user from AsyncStorage first
    const restoreUser = async () => {
      try {
        const savedUser = await AsyncStorage.getItem(AUTH_USER_KEY);
        if (savedUser && isMounted) {
          // User restored
        }
      } catch (error) {
      }
    };

    restoreUser();

    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;
      
      setUser(firebaseUser);

      // Save/remove user in AsyncStorage
      try {
        if (firebaseUser) {
          await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          }));
        } else {
          await AsyncStorage.removeItem(AUTH_USER_KEY);
        }
      } catch (error) {
      }

      // Varmista että kirjautuneella käyttäjällä on Firestore-dokumentti
      // (kattaa vanhat käyttäjät jotka rekisteröityivät ennen tätä logiikkaa)
      if (firebaseUser) {
        // Jos aktiivinen kirjautuminen on käynnissä (signIn/signUp/Google),
        // se hoitaa salausavaimen lataamisen — ei tehdä tässä päällekkäin
        if (_activeSignInInProgress) {
          setLoading(false);
          return;
        }

        // Sovelluksen uudelleenkäynnistys: yritä ladata avain laitteesta
        try {
          const loaded = await tryLoadKeyFromDevice(firebaseUser.uid);
          if (loaded) {
            setEncryptionStatus('ready');
          } else {
            const providerId = firebaseUser.providerData?.[0]?.providerId;
            if (providerId === 'password' && _lastEmailSignInPassword) {
              await unlockEncryptionWithPassword(firebaseUser.uid, _lastEmailSignInPassword);
              setEncryptionStatus('ready');
            } else {
              // Uudelleenasennuksen jälkeen laitteen SecureStore on tyhjä.
              // Pakota kirjautuminen uudelleen, jotta sähköpostisalasanaa voidaan
              // käyttää vanhan salausavaimen avaamiseen.
              _lastEmailSignInPassword = null;
              clearEncryptionKey();
              await signOut(auth);
              setEncryptionStatus('loading');
              return;
            }

            // Tarkennetaan taustalla onko kyseessä setup-vaihe ja varmistetaan
            // samalla että käyttäjädokumentti on olemassa — yksi getDoc riittää.
            void getDoc(doc(db, 'users', firebaseUser.uid))
              .then((snap) => {
                if (!snap.exists()) {
                  void ensureUserDocument(firebaseUser).catch(() => undefined);
                }
              })
              .catch(() => {
                // Ignore profile hydration errors here.
              });
          }
        } catch (error) {
          clearEncryptionKey();
          await signOut(auth).catch(() => undefined);
          setEncryptionStatus('loading');
        } finally {
          setLoading(false);
        }

        // Käyttäjädokumentin luonti hoidetaan ylläolevan getDoc-kutsun yhteydessä.
        // Ei tarvita erillistä getDoc-kutsua täällä.
      } else {
        _lastEmailSignInPassword = null;
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      _activeSignInInProgress = true;
      _lastEmailSignInPassword = password;
      const cred = await signInWithEmailAndPassword(auth, email, password);

      await ensureUserDocument(cred.user);

      // Fast-path: jos avain löytyy laitteelta, älä tee verkko+PBKDF2-kierrosta.
      const loadedFromDevice = await tryLoadKeyFromDevice(cred.user.uid);
      if (loadedFromDevice) {
        setEncryptionStatus('ready');
        return;
      }

      await unlockEncryptionWithPassword(cred.user.uid, password);

      if (getEncryptionStatus().isReady) {
        setEncryptionStatus('ready');
      }
    } catch (error: any) {
      clearEncryptionKey();
      await signOut(auth).catch(() => undefined);
      throw new Error(error.message);
    } finally {
      _activeSignInInProgress = false;
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      _activeSignInInProgress = true;
      _lastEmailSignInPassword = password;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDocument(credential.user);
      // Aseta salaus — sähköpostisalasana = päiväkirjan salafraasi
      await setupNewEncryptionKey(credential.user.uid, password);
      setEncryptionStatus('ready');
    } catch (error: any) {
      throw new Error(error.message);
    } finally {
      _activeSignInInProgress = false;
      setLoading(false);
    }
  };

  const sendResetPasswordEmail = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error: any) {
      throw new Error(error?.message || 'Password reset email failed');
    }
  };

  /** Asettaa päiväkirjan salafraasin kirjautuneelle käyttäjälle. */
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

  /** Avaa salauksen recovery keyn avulla. */
  const unlockWithRecoveryKey = async (recoveryKey: string): Promise<boolean> => {
    if (!auth.currentUser) return false;
    const result = await loadEncryptionKeyWithRecoveryKey(auth.currentUser.uid, recoveryKey);
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

  /**
   * Vaihtaa kirjautumissalasanan JA kapseloi masterKey:n uudelleen uudella salasanalla.
   * Järjestys: rewrap ensin (Firestore), sitten Firebase Auth updatePassword.
   * Jos rewrap onnistuu mutta Auth-päivitys epäonnistuu, masterKey on silti
   * auki uudella salasanalla — tämä on turvallisempi kuin päinvastainen järjestys.
   */
  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) throw new Error('Ei kirjautunutta käyttäjää');

    // Estetään onAuthStateChanged-käsittelijää häiritsemästä operaation aikana.
    // reauthenticateWithCredential ja updatePassword molemmat laukaisevat
    // onAuthStateChanged, joka voisi virhetilanteessa ajaa clearEncryptionKey().
    _activeSignInInProgress = true;
    try {
      // 1. Varmista tuore kirjautuminen nykyisellä salasanalla
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Kapseloi masterKey uudelleen uudella salasanalla (Firestore päivittyy)
      await rewrapEncryptionKey(currentUser.uid, newPassword);

      // 3. Päivitä Firebase Auth -salasana
      await updatePassword(currentUser, newPassword);

      // 4. Päivitä välimuisti
      _lastEmailSignInPassword = newPassword;
      setEncryptionRevision((prev) => prev + 1);
    } finally {
      _activeSignInInProgress = false;
    }
  };

  /** Luo uusi recovery key kirjautuneelle käyttäjälle. */
  const generateRecoveryKey = async (): Promise<string> => {
    if (!auth.currentUser) throw new Error('Ei kirjautunutta käyttäjää');
    return await createRecoveryKey(auth.currentUser.uid);
  };

  /**
   * Nollaa päiväkirjan salauksen käyttäjän nykyisellä kirjautumissalasanalla.
   * Käytä tätä vain tilanteessa, jossa vanhaa salafraasia ei enää tiedetä
   * (esim. kirjautumissalasana resetoitu).
   */
  const resetEncryptionWithPassword = async (password: string): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Ei kirjautunutta käyttäjää');

    const providerId = currentUser.providerData?.[0]?.providerId;
    if (providerId !== 'password') {
      throw new Error('Toiminto on käytettävissä vain sähköpostikirjautumisella.');
    }

    if (!currentUser.email) {
      throw new Error('Käyttäjän sähköpostia ei löytynyt.');
    }

    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);

    // Luo uusi salausavain ja kapseloi se nykyisellä salasanalla.
    // Tämä korvaa aiemman avainmateriaalin.
    await setupNewEncryptionKey(currentUser.uid, password);
    setEncryptionStatus('ready');
  };

  const logout = async () => {
    try {
      clearEncryptionKey();
      _lastEmailSignInPassword = null;
      setEncryptionStatus('loading');
      await signOut(auth);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const deleteAccount = async (password?: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Ei kirjautunutta käyttäjää');
      }

      const userId = currentUser.uid;
      const providerId = currentUser.providerData?.[0]?.providerId;

      // Varmista tuore kirjautuminen ENNEN datan poistoa.
      if (providerId === 'password') {
        if (!currentUser.email) {
          throw new Error('Käyttäjän sähköpostia ei löytynyt uudelleenkirjautumista varten.');
        }
        if (!password) {
          throw new Error('Syötä salasanasi tilin poistamista varten.');
        }

        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
      }

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

      if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        throw new Error('Väärä salasana. Tarkista salasana ja yritä uudelleen.');
      }
      if (error?.code === 'auth/requires-recent-login') {
        throw new Error('Turvallisuussyistä kirjaudu uudelleen sisään ja yritä sitten tilin poistoa uudestaan.');
      }

      throw new Error(error?.message || 'Tilin poistaminen epäonnistui.');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        encryptionStatus,
        encryptionRevision,
        signIn,
        signUp,
        sendResetPasswordEmail,
        setupEncryption,
        unlockWithPassphrase,
        unlockWithRecoveryKey,
        changeEncryptionPassphrase,
        changePassword,
        generateRecoveryKey,
        resetEncryptionWithPassword,
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
