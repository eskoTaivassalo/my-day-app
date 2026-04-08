import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const { signUp } = useAuth();

  const handleRegister = async () => {
    // Validation
    if (!email || !password || !confirmPassword) {
      Alert.alert('Virhe', 'Täytä kaikki kentät');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Virhe', 'Salasanan tulee olla vähintään 6 merkkiä');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Virhe', 'Salasanat eivät täsmää');
      return;
    }

    if (!gdprAccepted) {
      Alert.alert('Tietosuoja', 'Sinun täytyy hyväksyä tietosuojaseloste rekisteröitymispääseksä.');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      Alert.alert('Onnistui!', 'Tili luotu onnistuneesti');
      // Navigation happens automatically when auth state changes
    } catch (error: any) {
      let errorMessage = 'Rekisteröityminen epäonnistui';
      
      if (error.message.includes('email-already-in-use')) {
        errorMessage = 'Sähköpostiosoite on jo käytössä';
      } else if (error.message.includes('invalid-email')) {
        errorMessage = 'Virheellinen sähköpostiosoite';
      } else if (error.message.includes('weak-password')) {
        errorMessage = 'Salasana on liian heikko';
      }
      
      Alert.alert('Virhe', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Takaisin</Text>
            </TouchableOpacity>
            
            <Text style={styles.logo}>📝</Text>
            <Text style={styles.title}>Luo tili</Text>
            <Text style={styles.subtitle}>Aloita päiväkirjan pitäminen</Text>
          </View>

          {/* Registration Form */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Sähköposti"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="Salasana (vähintään 6 merkkiä)"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />

            <TextInput
              style={styles.input}
              placeholder="Vahvista salasana"
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />

            <TouchableOpacity
              style={[styles.button, (loading || !gdprAccepted) && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading || !gdprAccepted}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Rekisteröidy</Text>
              )}
            </TouchableOpacity>

            {/* GDPR-hyväksyntä */}
            <TouchableOpacity
              style={styles.gdprRow}
              onPress={() => setGdprAccepted(!gdprAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, gdprAccepted && styles.checkboxChecked]}>
                {gdprAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.gdprText}>
                Olen lukenut ja hyväksyän{' '}
                <Text
                  style={styles.gdprLink}
                  onPress={() => navigation.navigate('PrivacyPolicy')}
                >
                  tietosuojaselosteen
                </Text>
                {' '}(GDPR)
              </Text>
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Onko sinulla jo tili? </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.linkText}>Kirjaudu sisään</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  logo: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  gdprRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  gdprText: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  gdprLink: {
    color: '#007AFF',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
