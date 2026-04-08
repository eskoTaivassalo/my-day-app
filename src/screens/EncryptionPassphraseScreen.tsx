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

  const isSetup = encryptionStatus === 'needs_setup';

  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!passphrase.trim()) {
      Alert.alert('Virhe', 'Syötä salafraasi');
      return;
    }

    if (isSetup) {
      if (passphrase.length < 8) {
        Alert.alert('Liian lyhyt', 'Salafraasin tulee olla vähintään 8 merkkiä.');
        return;
      }
      if (passphrase !== confirm) {
        Alert.alert('Virhe', 'Salafraasit eivät täsmää.');
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
            'Väärä salafraasi',
            'Salafraasi oli väärä. Tarkista kirjoitusasu ja yritä uudelleen.'
          );
        }
      }
    } catch (error: any) {
      Alert.alert('Virhe', error.message ?? 'Tuntematon virhe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Ikoni */}
        <Text style={styles.icon}>{isSetup ? '🔑' : '🔒'}</Text>

        {/* Otsikko */}
        <Text style={styles.title}>
          {isSetup ? 'Aseta päiväkirjan salafraasi' : 'Avaa päiväkirja'}
        </Text>

        {/* Selitys */}
        <Text style={styles.description}>
          {isSetup
            ? 'Valitse salafraasi jolla päiväkirjasi sisältö salataan.\n\n' +
              'Tämä salafraasi tarvitaan jos vaihdat laitetta tai asennat sovelluksen uudelleen. ' +
              'Ilman sitä salattu data on menetetty — tallenna se turvalliseen paikkaan.'
            : 'Olet kirjautunut uudella laitteella tai sovellus on asennettu uudelleen.\n\n' +
              'Syötä aiemmin asettamasi salafraasi avataksesi päiväkirjasi.'}
        </Text>

        {/* Varoituslaatikko */}
        {isSetup && (
          <View style={styles.warning}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              Tallenna salafraasi esim. salasananhallintaohjelmaan.
              Jos unohdat sen, päiväkirjasi sisältöä ei voi palauttaa.
            </Text>
          </View>
        )}

        {/* Lomake */}
        <TextInput
          style={styles.input}
          placeholder={isSetup ? 'Salafraasi (min. 8 merkkiä)' : 'Salafraasi'}
          placeholderTextColor="#999"
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
        />

        {isSetup && (
          <TextInput
            style={styles.input}
            placeholder="Vahvista salafraasi"
            placeholderTextColor="#999"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSetup ? 'Aseta salafraasi' : 'Avaa päiväkirja'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Kirjaudu ulos -linkki */}
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Kirjaudu ulos</Text>
        </TouchableOpacity>

        {/* Info */}
        <Text style={styles.infoText}>
          🔐 Salafraasi ei koskaan lähde laitteeltasi palvelimelle.
          Sen avulla johdetaan salausavain päiväkirjasi suojaamiseksi.
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
