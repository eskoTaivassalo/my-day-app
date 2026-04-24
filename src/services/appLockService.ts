import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const PIN_HASH_KEY = 'app_lock_pin_hash';
const PIN_ENABLED_KEY = 'app_lock_enabled';
const BIOMETRICS_ENABLED_KEY = 'app_lock_biometrics';

/**
 * Hash PIN using SHA-256 so it is never stored as plaintext.
 */
const hashPin = async (pin: string): Promise<string> => {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin + 'my-day-app-pin-salt-v1'
  );
};

export const isPinEnabled = async (): Promise<boolean> => {
  try {
    const val = await SecureStore.getItemAsync(PIN_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
};

export const isBiometricsEnabled = async (): Promise<boolean> => {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
};

export const setupPin = async (pin: string): Promise<void> => {
  const hash = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'true');
};

export const removePin = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'false');
  await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, 'false');
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  try {
    const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
    if (!storedHash) return false;
    const inputHash = await hashPin(pin);
    return storedHash === inputHash;
  } catch {
    return false;
  }
};

export const setBiometricsEnabled = async (enabled: boolean): Promise<void> => {
  await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, enabled ? 'true' : 'false');
};
