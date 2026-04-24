import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  isPinEnabled,
  isBiometricsEnabled,
  verifyPin,
  setBiometricsEnabled as persistBiometricsEnabled,
  setupPin,
  removePin,
} from '../services/appLockService';

interface AppLockContextType {
  isLocked: boolean;
  pinEnabled: boolean;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  enablePin: (pin: string) => Promise<void>;
  disablePin: () => Promise<void>;
  enableBiometrics: (enabled: boolean) => Promise<void>;
  lockNow: () => void;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  // Background grace period: 15 seconds — shorter = more secure
  const LOCK_AFTER_BACKGROUND_MS = 15_000;

  useEffect(() => {
    const init = async () => {
      const pinOn = await isPinEnabled();
      const bioOn = await isBiometricsEnabled();
      const bioAvail = await LocalAuthentication.hasHardwareAsync() &&
        await LocalAuthentication.isEnrolledAsync();

      setPinEnabled(pinOn);
      setBiometricsEnabledState(bioOn);
      setBiometricsAvailable(!!bioAvail);

      if (pinOn) {
        setIsLocked(true);
        if (bioOn && bioAvail) {
          // Auto-attempt biometrics on first open
          setTimeout(() => attemptBiometricsQuietly(), 500);
        }
      }
    };

    init();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appState.current === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        backgroundedAt.current = Date.now();
      }

      if (nextState === 'active' && appState.current !== 'active') {
        if (pinEnabled && backgroundedAt.current !== null) {
          const elapsed = Date.now() - backgroundedAt.current;
          if (elapsed > LOCK_AFTER_BACKGROUND_MS) {
            setIsLocked(true);
            if (biometricsEnabled && biometricsAvailable) {
              setTimeout(() => attemptBiometricsQuietly(), 300);
            }
          }
          backgroundedAt.current = null;
        }
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [pinEnabled, biometricsEnabled, biometricsAvailable]);

  const attemptBiometricsQuietly = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Avaa sovellus',
        cancelLabel: 'Käytä PIN-koodia',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setIsLocked(false);
      }
    } catch {
      // Biometrics failed silently — user can use PIN
    }
  };

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) setIsLocked(false);
    return ok;
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Avaa sovellus',
        cancelLabel: 'Käytä PIN-koodia',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const enablePin = useCallback(async (pin: string) => {
    await setupPin(pin);
    setPinEnabled(true);
  }, []);

  const disablePin = useCallback(async () => {
    await removePin();
    setPinEnabled(false);
    setBiometricsEnabledState(false);
    setIsLocked(false);
  }, []);

  const enableBiometrics = useCallback(async (enabled: boolean) => {
    await persistBiometricsEnabled(enabled);
    setBiometricsEnabledState(enabled);
  }, []);

  const lockNow = useCallback(() => {
    if (pinEnabled) setIsLocked(true);
  }, [pinEnabled]);

  return (
    <AppLockContext.Provider value={{
      isLocked,
      pinEnabled,
      biometricsEnabled,
      biometricsAvailable,
      unlockWithPin,
      unlockWithBiometrics,
      enablePin,
      disablePin,
      enableBiometrics,
      lockNow,
    }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
