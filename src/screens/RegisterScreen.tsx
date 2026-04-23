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
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import AppLogo from '../components/AppLogo';

export default function RegisterScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const { signUp } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';

  const handleRegister = async () => {
    // Validation
    if (!email || !password || !confirmPassword) {
      Alert.alert(t('common_error'), t('common_fill_all_fields'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('common_error'), t('register_password_min'));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('common_error'), t('register_passwords_no_match'));
      return;
    }

    if (!gdprAccepted) {
      Alert.alert(t('register_gdpr_modal_title'), t('register_gdpr_required'));
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      Alert.alert(t('common_success'), t('register_success'));
      // Navigation happens automatically when auth state changes
    } catch (error: any) {
      let errorMessage = t('register_failed');
      
      if (error.message.includes('email-already-in-use')) {
        errorMessage = t('register_email_in_use');
      } else if (error.message.includes('invalid-email')) {
        errorMessage = t('register_invalid_email');
      } else if (error.message.includes('weak-password')) {
        errorMessage = t('register_weak_password');
      }
      
      Alert.alert(t('common_error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
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
              <Text style={[styles.backButtonText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('common_back')}</Text>
            </TouchableOpacity>
            
            <AppLogo />
            <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('register_title')}</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('register_subtitle')}</Text>
          </View>

          {/* Registration Form */}
          <View style={styles.form}>
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
              placeholder={t('register_email_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

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
              placeholder={t('register_password_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />

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
              placeholder={t('register_confirm_password_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary },
                (loading || !gdprAccepted) && styles.buttonDisabled,
              ]}
              onPress={handleRegister}
              disabled={loading || !gdprAccepted}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.buttonText, { fontFamily: theme.fonts.bodyFamily }]}>{t('register_button')}</Text>
              )}
            </TouchableOpacity>

            {/* GDPR-hyväksyntä */}
            <TouchableOpacity
              style={styles.gdprRow}
              onPress={() => setGdprAccepted(!gdprAccepted)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: theme.colors.primary },
                  gdprAccepted && [styles.checkboxChecked, { backgroundColor: theme.colors.primary }],
                ]}
              >
                {gdprAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.gdprText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                {t('register_gdpr_text')}
                <Text
                  style={[styles.gdprLink, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}
                  onPress={() => navigation.navigate('PrivacyPolicy')}
                >
                  {t('register_gdpr_link')}
                </Text>
                {t('register_gdpr_suffix')}
              </Text>
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('register_have_account')}</Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={[styles.linkText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('register_login_link')}</Text>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
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
