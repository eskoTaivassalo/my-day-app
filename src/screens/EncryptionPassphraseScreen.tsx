import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

/**
 * EncryptionPassphraseScreen
 *
 * Näytetään kahdessa tilanteessa:
 *  1. needs_setup  — Google-käyttäjä kirjautuu ensimmäistä kertaa: aseta päiväkirjan salafraasi
 *  2. needs_passphrase — Käyttäjä on uudella laitteella: syötä salafraasi avaimen palauttamiseksi
 *
 * Sähköpostikirjautujat eivät koskaan näe tätä ruutua — heillä Firebase-salasana = salafraasi.
 */
export default function EncryptionPassphraseScreen() {
  const { encryptionStatus, setupEncryption, unlockWithPassphrase, logout } = useAuth();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';

  const strings = language === 'en'
    ? {
        error: 'Error',
        enterPassphrase: 'Enter passphrase',
        tooShortTitle: 'Too short',
        tooShortBody: 'Passphrase must be at least 8 characters.',
        mismatch: 'Passphrases do not match.',
        wrongPassphraseTitle: 'Wrong passphrase',
        wrongPassphraseBody: 'Passphrase was incorrect. Check spelling and try again.',
        unknownError: 'Unknown error',
        setupTitle: 'Set diary passphrase',
        unlockTitle: 'Unlock diary',
        setupDescription:
          'Choose a passphrase to encrypt your diary content.\n\n' +
          'This passphrase is required if you switch devices or reinstall the app. ' +
          'Without it, encrypted data is lost - store it safely.',
        unlockDescription:
          'You are signed in on a new device or the app was reinstalled.\n\n' +
          'Enter your previously set passphrase to unlock your diary.',
        warning:
          'Save your passphrase in a password manager. If you forget it, your diary content cannot be recovered.',
        passphrasePlaceholderSetup: 'Passphrase (min. 8 characters)',
        passphrasePlaceholderUnlock: 'Passphrase',
        confirmPlaceholder: 'Confirm passphrase',
        setupButton: 'Set passphrase',
        unlockButton: 'Unlock diary',
        logout: 'Sign out',
        info:
          '🔐 Your passphrase never leaves your device to the server. It is used to derive the encryption key protecting your diary.',
      }
    : language === 'sv'
    ? {
        error: 'Fel',
        enterPassphrase: 'Ange losenfras',
        tooShortTitle: 'For kort',
        tooShortBody: 'Losenfrasen maste vara minst 8 tecken.',
        mismatch: 'Losenfraserna matchar inte.',
        wrongPassphraseTitle: 'Fel losenfras',
        wrongPassphraseBody: 'Losenfrasen var fel. Kontrollera stavningen och forsok igen.',
        unknownError: 'Okant fel',
        setupTitle: 'Stall in dagbokens losenfras',
        unlockTitle: 'Las upp dagboken',
        setupDescription:
          'Valj en losenfras som krypterar dagbokens innehall.\n\n' +
          'Den behovs om du byter enhet eller installerar appen igen. ' +
          'Utan den gar krypterad data forlorad - spara den sakert.',
        unlockDescription:
          'Du ar inloggad pa en ny enhet eller appen har installerats om.\n\n' +
          'Ange din tidigare losenfras for att lasa upp dagboken.',
        warning:
          'Spara losenfrasen till exempel i en losenordshanterare. Om du glommer den kan innehallet inte aterstallas.',
        passphrasePlaceholderSetup: 'Losenfras (minst 8 tecken)',
        passphrasePlaceholderUnlock: 'Losenfras',
        confirmPlaceholder: 'Bekrafta losenfras',
        setupButton: 'Stall in losenfras',
        unlockButton: 'Las upp dagboken',
        logout: 'Logga ut',
        info:
          '🔐 Losenfrasen lamnar aldrig din enhet till servern. Den anvands for att skapa krypteringsnyckeln som skyddar din dagbok.',
      }
    : {
        error: 'Virhe',
        enterPassphrase: 'Syota salafraasi',
        tooShortTitle: 'Liian lyhyt',
        tooShortBody: 'Salafraasin tulee olla vahintaan 8 merkkia.',
        mismatch: 'Salafraasit eivat tasmää.',
        wrongPassphraseTitle: 'Väärä salafraasi',
        wrongPassphraseBody: 'Salafraasi oli väärä. Tarkista kirjoitusasu ja yrita uudelleen.',
        unknownError: 'Tuntematon virhe',
        setupTitle: 'Aseta paivakirjan salafraasi',
        unlockTitle: 'Avaa paivakirja',
        setupDescription:
          'Valitse salafraasi jolla paivakirjasi sisalto salataan.\n\n' +
          'Tama salafraasi tarvitaan jos vaihdat laitetta tai asennat sovelluksen uudelleen. ' +
          'Ilman sita salattu data on menetetty - tallenna se turvalliseen paikkaan.',
        unlockDescription:
          'Olet kirjautunut uudella laitteella tai sovellus on asennettu uudelleen.\n\n' +
          'Syota aiemmin asettamasi salafraasi avataksesi paivakirjasi.',
        warning:
          'Tallenna salafraasi esim. salasananhallintaohjelmaan. Jos unohdat sen, paivakirjasi sisaltoa ei voi palauttaa.',
        passphrasePlaceholderSetup: 'Salafraasi (min. 8 merkkia)',
        passphrasePlaceholderUnlock: 'Salafraasi',
        confirmPlaceholder: 'Vahvista salafraasi',
        setupButton: 'Aseta salafraasi',
        unlockButton: 'Avaa paivakirja',
        logout: 'Kirjaudu ulos',
        info:
          '🔐 Salafraasi ei koskaan lahde laitteeltasi palvelimelle. Sen avulla johdetaan salausavain paivakirjasi suojaamiseksi.',
      };

  const isSetup = encryptionStatus === 'needs_setup';

  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!passphrase.trim()) {
      Alert.alert(strings.error, strings.enterPassphrase);
      return;
    }

    if (isSetup) {
      if (passphrase.length < 8) {
        Alert.alert(strings.tooShortTitle, strings.tooShortBody);
        return;
      }
      if (passphrase !== confirm) {
        Alert.alert(strings.error, strings.mismatch);
        return;
      }
    }

    setLoading(true);
    try {
      if (isSetup) {
        await setupEncryption(passphrase);
      } else {
        const ok = await unlockWithPassphrase(passphrase);
        if (!ok) {
          Alert.alert(
            strings.wrongPassphraseTitle,
            strings.wrongPassphraseBody,
          );
        }
      }
    } catch (error: any) {
      Alert.alert(strings.error, error.message ?? strings.unknownError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Ikoni */}
        <Text style={styles.icon}>{isSetup ? '🔑' : '🔒'}</Text>

        {/* Otsikko */}
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }] }>
          {isSetup ? strings.setupTitle : strings.unlockTitle}
        </Text>

        {/* Selitys */}
        <Text style={[styles.description, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }] }>
          {isSetup ? strings.setupDescription : strings.unlockDescription}
        </Text>

        {/* Varoituslaatikko */}
        {isSetup && (
          <View style={[styles.warning, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderLeftColor: theme.colors.accent }] }>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={[styles.warningText, { color: isDark ? '#FDE68A' : '#92400E', fontFamily: theme.fonts.bodyFamily }] }>
              {strings.warning}
            </Text>
          </View>
        )}

        {/* Lomake */}
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? '#0B1220' : theme.colors.backgroundLight,
              borderColor: theme.colors.border,
              color: theme.colors.text,
              fontFamily: theme.fonts.bodyFamily,
            },
          ]}
          placeholder={isSetup ? strings.passphrasePlaceholderSetup : strings.passphrasePlaceholderUnlock}
          placeholderTextColor={theme.colors.textSecondary}
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
        />

        {isSetup && (
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#0B1220' : theme.colors.backgroundLight,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontFamily: theme.fonts.bodyFamily,
              },
            ]}
            placeholder={strings.confirmPlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary }, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, { fontFamily: theme.fonts.bodyFamily }] }>
              {isSetup ? strings.setupButton : strings.unlockButton}
            </Text>
          )}
        </TouchableOpacity>

        {/* Kirjaudu ulos -linkki */}
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={[styles.logoutText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{strings.logout}</Text>
        </TouchableOpacity>

        {/* Info */}
        <Text style={[styles.infoText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
          {strings.info}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flexGrow: 1,
    padding: 28,
    justifyContent: 'center',
  },
  icon: {
    fontSize: 72,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  warning: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    gap: 10,
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 19,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 20,
  },
  logoutText: {
    color: '#007AFF',
    fontSize: 15,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
    textAlign: 'center',
  },
});
