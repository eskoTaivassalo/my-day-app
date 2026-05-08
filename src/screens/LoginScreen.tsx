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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import AppLogo from '../components/AppLogo';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, sendResetPasswordEmail } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const [showPassword, setShowPassword] = useState(false);
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common_error'), t('common_fill_all_fields'));
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      // Navigation happens automatically when auth state changes
    } catch (error: any) {
      Alert.alert(t('login_failed'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert(t('common_error'), t('login_reset_enter_email'));
      return;
    }

    try {
      await sendResetPasswordEmail(email);
      Alert.alert(t('common_success'), t('login_reset_email_sent'));
    } catch (error: any) {
      Alert.alert(t('common_error'), error.message || t('login_reset_failed'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.header}>
          <AppLogo showWordmark={false} />
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>My days</Text>
        </View>

        {/* Login Form */}
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
            placeholder={t('login_email_placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />


          <View style={{ position: 'relative' }}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#0B1220' : theme.colors.backgroundLight,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  fontFamily: theme.fonts.bodyFamily,
                  paddingRight: 48, // tilaa ikonille
                },
              ]}
              placeholder={t('login_password_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute',
                right: 12,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                width: 32,
                zIndex: 10,
              }}
              accessibilityLabel={showPassword ? (t('login_hide_password') || 'Piilota salasana') : (t('login_show_password') || 'Näytä salasana')}
            >
              <Text style={{ fontSize: 22, color: theme.colors.textSecondary }}>
                {showPassword ? '🙈' : '👁️'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary }, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buttonText, { fontFamily: theme.fonts.bodyFamily }]}>{t('login_button')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordBtn}>
            <Text style={[styles.forgotPasswordText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>
              {t('login_forgot_password')}
            </Text>
          </TouchableOpacity>

          {/* Sign Up Link */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('login_no_account')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={[styles.linkText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('login_register_link')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  title: {
    fontSize: 30,
    fontWeight: '600',
    fontStyle: 'italic',
    fontFamily: Platform.select({
      ios: 'Snell Roundhand',
      android: 'cursive',
      default: undefined,
    }),
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
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
  forgotPasswordBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
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
});
