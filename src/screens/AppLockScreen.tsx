import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
  Animated,
} from 'react-native';
import { useAppLock } from '../contexts/AppLockContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { colors, spacing, borderRadius, typography } from '../theme/theme';

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;

export default function AppLockScreen() {
  const { unlockWithPin, unlockWithBiometrics, biometricsEnabled, biometricsAvailable } = useAppLock();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();

  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  const shakeAnim = useState(new Animated.Value(0))[0];
  const hasPromptedBiometrics = useRef(false);

  // Countdown timer when too many attempts
  useEffect(() => {
    if (!locked || lockSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockSeconds((s) => {
        if (s <= 1) {
          setLocked(false);
          setAttempts(0);
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [locked, lockSeconds]);

  // Biometrics is primary unlock method when enabled; PIN remains fallback.
  useEffect(() => {
    if (!biometricsEnabled || !biometricsAvailable || locked) return;
    if (hasPromptedBiometrics.current) return;

    hasPromptedBiometrics.current = true;
    unlockWithBiometrics();
  }, [biometricsEnabled, biometricsAvailable, locked, unlockWithBiometrics]);

  const shake = () => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleDigit = async (digit: string) => {
    if (locked) return;
    const newPin = pin + digit;
    setPin(newPin);

    if (newPin.length === PIN_LENGTH) {
      const ok = await unlockWithPin(newPin);
      if (!ok) {
        shake();
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setPin('');

        if (nextAttempts >= MAX_ATTEMPTS) {
          setLocked(true);
          setLockSeconds(30);
        }
      }
      // On success, AppLockContext sets isLocked=false → this screen unmounts
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) setPin((p) => p.slice(0, -1));
  };

  const handleBiometrics = async () => {
    if (locked) return;
    await unlockWithBiometrics();
  };

  const handleLogout = () => {
    Alert.alert(
      t('app_lock_logout_title'),
      t('app_lock_logout_msg'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('profile_logout'),
          style: 'destructive',
          onPress: async () => { await logout(); },
        },
      ]
    );
  };

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);

  const digitRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  const showBiometrics = biometricsEnabled && biometricsAvailable;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.inner}>
        {/* Lock icon + title */}
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>
          {t('app_lock_title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
          {locked
            ? `${t('app_lock_too_many_attempts')} ${lockSeconds}s`
            : attempts > 0
            ? `${t('app_lock_wrong_pin')} (${attempts}/${MAX_ATTEMPTS})`
            : t('app_lock_enter_pin')}
        </Text>

        {/* PIN dots */}
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          {dots.map((filled, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                filled
                  ? { backgroundColor: theme.colors.primary }
                  : { backgroundColor: 'transparent', borderWidth: 2, borderColor: theme.colors.border },
              ]}
            />
          ))}
        </Animated.View>

        {/* Numpad */}
        <View style={styles.numpad}>
          {digitRows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.digitBtn, { backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }]}
                  onPress={() => handleDigit(d)}
                  disabled={locked}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.digitText, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* Bottom row: biometrics / 0 / delete */}
          <View style={styles.row}>
            {showBiometrics ? (
              <TouchableOpacity
                style={[styles.digitBtn, { backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }]}
                onPress={handleBiometrics}
                activeOpacity={0.7}
              >
                <Text style={styles.bioIcon}>👆</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.digitBtn, styles.emptyBtn]} />
            )}

            <TouchableOpacity
              style={[styles.digitBtn, { backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }]}
              onPress={() => handleDigit('0')}
              disabled={locked}
              activeOpacity={0.7}
            >
              <Text style={[styles.digitText, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>0</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.digitBtn, { backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }]}
              onPress={handleDelete}
              disabled={locked}
              activeOpacity={0.7}
            >
              <Text style={[styles.digitText, { color: theme.colors.text }]}>⌫</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout fallback */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={[styles.logoutText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
            {t('app_lock_forgot')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  lockIcon: {
    fontSize: 52,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.xl,
    textAlign: 'center',
    minHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: spacing.xxxl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  numpad: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  digitBtn: {
    flex: 1,
    height: 72,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtn: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  digitText: {
    fontSize: 26,
    fontWeight: '600',
  },
  bioIcon: {
    fontSize: 28,
  },
  logoutBtn: {
    marginTop: spacing.xxl,
    padding: spacing.md,
  },
  logoutText: {
    fontSize: typography.fontSizes.sm,
    textDecorationLine: 'underline',
  },
});
