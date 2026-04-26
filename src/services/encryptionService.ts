/**
 * encryptionService.ts
 *
 * Zero-Knowledge End-to-End Encryption — Key Wrapping Architecture
 * ─────────────────────────────────────────────────────────────────
 * Sama arkkitehtuuri kuin Bitwarden, 1Password ja muilla salasananhallintaohjelmilla.
 *
 * Miten toimii:
 *  1. masterKey (256-bit) = kerran luotu satunnaisavain käyttäjäkohtaisesti
 *  2. wrappingKey = PBKDF2-SHA256(passphrase, salt, 100 000 kierrosta)
 *  3. encryptedMasterKey = XSalsa20-Poly1305(masterKey, wrappingKey) → Firestore
 *  4. masterKey cachessa laitteen SecureStoressa (iOS Keychain / Android Keystore)
 *
 * Laitteenvaihto:
 *  1. SecureStore tyhjä (uusi laite)
 *  2. Käyttäjä syöttää salafraasin
 *  3. Haetaan encryptedMasterKey + salt Firestoresta
 *  4. Johdetaan wrappingKey = PBKDF2(passphrase, salt)
 *  5. Puretaan masterKey = unwrap(encryptedMasterKey, wrappingKey)
 *  6. Tallennetaan masterKey SecureStoreen → seamless jatkossa
 *  7. Kaikki data jälleen luettavissa
 *
 * Salafraasin vaihto:
 *  1. masterKey pysyy samana — data EI tarvitse uudelleensalausta
 *  2. Uusi salt ja uusi wrappingKey johdetaan
 *  3. masterKey kapseloidaan uudelleen uudella wrappingKey:llä
 *  4. Vanha wrappingKey hylätään
 *
 * Algoritmit:
 *  - Salaus: XSalsa20-Poly1305 (tweetnacl secretbox)
 *  - Avainjohdannainen: PBKDF2-SHA256, 100 000 kierrosta (@noble/hashes)
 */

import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
// @ts-ignore — @noble/hashes exports .js paths
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
// @ts-ignore
import { sha256 } from '@noble/hashes/sha2.js';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// ─── Vakiot ───────────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000;
const RECOVERY_KEY_PBKDF2_ITERATIONS = 150_000;
const SECURE_STORE_PREFIX = 'diary_master_key_v2_';
const VERIFY_MAGIC = 'MY_DAY_DIARY_V2_VERIFIED';

// ─── Muistissa oleva masterKey ────────────────────────────────────────────────
let _masterKey: Uint8Array | null = null;

// ─── Sisäiset apufunktiot ─────────────────────────────────────────────────────

/** Johtaa käärintäavaimen salafraasin ja suolan avulla (PBKDF2-SHA256). */
const deriveWrappingKey = (passphrase: string, saltBase64: string): Uint8Array =>
  pbkdf2(sha256, decodeUTF8(passphrase), decodeBase64(saltBase64), {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  });

/** Johtaa wrappingKey:n recovery keyn ja suolan avulla. */
const deriveRecoveryWrappingKey = (recoveryKey: string, saltBase64: string): Uint8Array =>
  pbkdf2(sha256, decodeUTF8(recoveryKey), decodeBase64(saltBase64), {
    c: RECOVERY_KEY_PBKDF2_ITERATIONS,
    dkLen: 32,
  });

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const normalizeRecoveryKey = (value: string): string => value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();

const formatRecoveryKey = (hex: string): string => {
  const normalized = normalizeRecoveryKey(hex);
  const groups: string[] = [];
  for (let i = 0; i < normalized.length; i += 4) {
    groups.push(normalized.slice(i, i + 4));
  }
  return groups.join('-');
};

/** Kapseloi masterKey:n käärintäavaimella. */
const wrapMasterKey = (masterKey: Uint8Array, wrappingKey: Uint8Array): string => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(masterKey, nonce, wrappingKey);
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  return encodeBase64(combined);
};

/** Purkaa masterKey:n kapselin. Palauttaa null jos väärä avain. */
const unwrapMasterKey = (wrappedBase64: string, wrappingKey: Uint8Array): Uint8Array | null => {
  const combined = decodeBase64(wrappedBase64);
  const nonce = combined.slice(0, nacl.secretbox.nonceLength);
  const ciphertext = combined.slice(nacl.secretbox.nonceLength);
  return nacl.secretbox.open(ciphertext, nonce, wrappingKey);
};

/** Luo verifikaatiotokenin — todistaa avaimen oikeellisuuden ilman avaimen tallennusta. */
const buildVerificationToken = (masterKey: Uint8Array): string => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(decodeUTF8(VERIFY_MAGIC), nonce, masterKey);
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  return encodeBase64(combined);
};

/** Tallentaa masterKey:n laitteen suojattuun tallennukseen. */
const cacheInSecureStore = async (userId: string, masterKey: Uint8Array): Promise<void> => {
  await SecureStore.setItemAsync(
    SECURE_STORE_PREFIX + userId,
    encodeBase64(masterKey),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
  );
};

// ─── Julkinen API ─────────────────────────────────────────────────────────────

export type LoadKeyResult = 'ready' | 'setup_needed' | 'wrong_passphrase';
export type LoadRecoveryKeyResult = 'ready' | 'not_configured' | 'wrong_recovery_key';

/**
 * Yrittää ladata masterKey:n laitteen SecureStoresta.
 * Palauttaa true jos onnistuu (saumaton avaus, ei tarvita salafraasin syöttöä).
 * Kutsutaan sovelluksen käynnistyessä kun käyttäjä on jo kirjautunut.
 */
export const tryLoadKeyFromDevice = async (userId: string): Promise<boolean> => {
  try {
    const stored = await SecureStore.getItemAsync(SECURE_STORE_PREFIX + userId);
    if (!stored) return false;
    _masterKey = decodeBase64(stored);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asettaa uuden käyttäjän salauksen:
 * generoi masterKey:n, kapseloi salafraasin avulla, tallentaa Firestoreen.
 * Tallentaa myös masterKey:n SecureStoreen.
 */
export const setupNewEncryptionKey = async (userId: string, passphrase: string): Promise<void> => {
  const masterKey = nacl.randomBytes(32);
  const saltBase64 = encodeBase64(nacl.randomBytes(32));
  const wrappingKey = deriveWrappingKey(passphrase, saltBase64);
  const encryptedMasterKey = wrapMasterKey(masterKey, wrappingKey);
  const keyVerificationToken = buildVerificationToken(masterKey);

  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    encryptionSalt: saltBase64,
    encryptedMasterKey,
    keyVerificationToken,
  }, { merge: true });

  _masterKey = masterKey;
  await cacheInSecureStore(userId, masterKey);
};

/**
 * Lataa masterKey:n Firestoresta salafraasin avulla.
 * Käytetään kun SecureStore on tyhjä (uusi laite / sovellus asennettu uudelleen).
 * Tallentaa masterKey:n onnistumisen jälkeen SecureStoreen.
 */
export const loadEncryptionKey = async (userId: string, passphrase: string): Promise<LoadKeyResult> => {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists() || !snap.data().encryptedMasterKey) return 'setup_needed';

  const data = snap.data();
  const wrappingKey = deriveWrappingKey(passphrase, data.encryptionSalt);
  const masterKey = unwrapMasterKey(data.encryptedMasterKey, wrappingKey);
  if (!masterKey) return 'wrong_passphrase';

  _masterKey = masterKey;
  await cacheInSecureStore(userId, masterKey);
  return 'ready';
};

/**
 * Vaihtaa salafraasin: kapseloi masterKey:n uudelleen uuden salafraasin avulla.
 * masterKey (ja kaikki salattu data) pysyy samana — uudelleensalausta ei tarvita.
 */
export const rewrapEncryptionKey = async (userId: string, newPassphrase: string): Promise<void> => {
  if (!_masterKey) throw new Error('Salausavain ei ole ladattu. Kirjaudu uudelleen sisään.');

  const saltBase64 = encodeBase64(nacl.randomBytes(32));
  const wrappingKey = deriveWrappingKey(newPassphrase, saltBase64);
  const encryptedMasterKey = wrapMasterKey(_masterKey, wrappingKey);

  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { encryptionSalt: saltBase64, encryptedMasterKey });
  // Päivitä SecureStore uudella kappeleella — masterKey on sama
  await cacheInSecureStore(userId, _masterKey);
};

/**
 * Luo käyttäjälle recovery keyn, jolla masterKey voidaan avata,
 * vaikka salasana/salafraasi vaihtuisi.
 */
export const createRecoveryKey = async (userId: string): Promise<string> => {
  if (!_masterKey) throw new Error('Salausavain ei ole ladattu. Kirjaudu uudelleen sisään.');

  const rawRecoveryKey = bytesToHex(nacl.randomBytes(16));
  const recoveryKey = formatRecoveryKey(rawRecoveryKey);
  const normalizedRecoveryKey = normalizeRecoveryKey(recoveryKey);

  const recoverySalt = encodeBase64(nacl.randomBytes(32));
  const recoveryWrappingKey = deriveRecoveryWrappingKey(normalizedRecoveryKey, recoverySalt);
  const recoveryEncryptedMasterKey = wrapMasterKey(_masterKey, recoveryWrappingKey);

  const userRef = doc(db, 'users', userId);
  await setDoc(
    userRef,
    {
      recoverySalt,
      recoveryEncryptedMasterKey,
    },
    { merge: true }
  );

  return recoveryKey;
};

/** Avaa masterKey:n recovery keyn avulla. */
export const loadEncryptionKeyWithRecoveryKey = async (
  userId: string,
  recoveryKey: string
): Promise<LoadRecoveryKeyResult> => {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);

  if (!snap.exists()) return 'not_configured';

  const data = snap.data();
  if (!data.recoverySalt || !data.recoveryEncryptedMasterKey) {
    return 'not_configured';
  }

  const normalizedRecoveryKey = normalizeRecoveryKey(recoveryKey);
  const recoveryWrappingKey = deriveRecoveryWrappingKey(normalizedRecoveryKey, data.recoverySalt);
  const masterKey = unwrapMasterKey(data.recoveryEncryptedMasterKey, recoveryWrappingKey);
  if (!masterKey) return 'wrong_recovery_key';

  _masterKey = masterKey;
  await cacheInSecureStore(userId, masterKey);
  return 'ready';
};

/** Salaa merkkijonon. Palauttaa Base64-koodatun salatun arvon. */
export const encryptText = (plaintext: string): string => {
  if (!_masterKey) throw new Error('Salausavain ei ole ladattu');
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(decodeUTF8(plaintext), nonce, _masterKey);
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  return encodeBase64(combined);
};

/** Purkaa salatun merkkijonon. */
export const decryptText = (cipherBase64: string): string => {
  if (!_masterKey) throw new Error('Salausavain ei ole ladattu');
  const combined = decodeBase64(cipherBase64);
  const nonce = combined.slice(0, nacl.secretbox.nonceLength);
  const ciphertext = combined.slice(nacl.secretbox.nonceLength);
  const decrypted = nacl.secretbox.open(ciphertext, nonce, _masterKey);
  if (!decrypted) throw new Error('Salauksen purku epäonnistui');
  return encodeUTF8(decrypted);
};

/** Salaa binääridatan (kuville, videoille, dokumenteille). */
export const encryptBytes = (data: Uint8Array): Uint8Array => {
  if (!_masterKey) throw new Error('Salausavain ei ole ladattu');
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(data, nonce, _masterKey);
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  return combined;
};

/** Purkaa salatun binääridatan. */
export const decryptBytes = (data: Uint8Array): Uint8Array => {
  if (!_masterKey) throw new Error('Salausavain ei ole ladattu');
  const nonce = data.slice(0, nacl.secretbox.nonceLength);
  const ciphertext = data.slice(nacl.secretbox.nonceLength);
  const decrypted = nacl.secretbox.open(ciphertext, nonce, _masterKey);
  if (!decrypted) throw new Error('Binääridatan salauksen purku epäonnistui');
  return decrypted;
};

/**
 * Poistaa masterKey:n muistista (uloskirjautuminen).
 * SecureStore-cacheen avain jää — seuraava kirjautuminen on saumaton.
 */
export const clearEncryptionKey = (): void => {
  _masterKey = null;
};

/**
 * Poistaa masterKey:n sekä muistista että SecureStoresta (tilin poisto).
 * Tämän jälkeen salattu data on PYSYVÄSTI menetetty.
 */
export const deleteEncryptionKey = async (userId: string): Promise<void> => {
  _masterKey = null;
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_PREFIX + userId);
  } catch { /* ignore */ }
};

/** Palauttaa salauksen tilan. */
export const getEncryptionStatus = (): { isReady: boolean } => ({
  isReady: _masterKey !== null,
});

