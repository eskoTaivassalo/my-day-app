import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import { getEntries, uploadProfileImage, updateUserProfile, getUserProfile } from '../services/diaryService';
import { DiaryEntry } from '../types/DiaryEntry';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';
import { calculateStreaks } from '../utils/achievementUtils';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, deleteAccount } = useAuth();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const locale = getLocaleFromLanguage(language);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [stats, setStats] = useState({
    totalEntries: 0,
    totalImages: 0,
    longestStreak: 0,
    currentStreak: 0,
    firstEntryDate: null as Date | null,
  });

  useEffect(() => {
    if (user) {
      loadStats();
      loadUserProfile();
    }
  }, [user]);

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const profile = await getUserProfile(user.uid);

      if (profile?.photoURL) {
        setProfileImage(profile.photoURL);
      }
    } catch {
    }
  };


  const loadStats = async () => {
    if (!user) return;

    try {
      const userEntries = await getEntries(user.uid);

      // Calculate stats
      const totalImages = userEntries.reduce((sum, entry) => sum + (entry.images?.length || 0), 0);
      const firstEntry = userEntries.length > 0 ? userEntries[userEntries.length - 1] : null;
      
      // Calculate streaks
      const { current, longest } = calculateStreaks(userEntries);

      setStats({
        totalEntries: userEntries.length,
        totalImages,
        longestStreak: longest,
        currentStreak: current,
        firstEntryDate: firstEntry ? new Date(firstEntry.date) : null,
      });
    } catch {
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('profile_logout_confirm_title'),
      t('profile_logout_confirm_msg'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('profile_logout_button'),
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch {
              Alert.alert(t('common_error'), t('profile_logout_failed'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile_delete_title'),
      t('profile_delete_confirm1'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('profile_delete_button'),
          style: 'destructive',
          onPress: () => {
            // Kaksoisvarmistus
            Alert.alert(
              t('profile_delete_confirm2_title'),
              t('profile_delete_confirm2'),
              [
                { text: t('common_cancel'), style: 'cancel' },
                {
                  text: t('profile_delete_confirm2_yes'),
                  style: 'destructive',
                  onPress: () => {
                    setDeletePassword('');
                    setShowDeletePasswordModal(true);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleChangeProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(t('common_permission_required'), t('entry_camera_photo_permission'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0] && user) {
        setUploadingImage(true);
        const imageUri = result.assets[0].uri;
        
        // Upload image to Firebase Storage
        const photoURL = await uploadProfileImage(imageUri, user.uid);
        
        // Update user profile in Firestore
        await updateUserProfile(user.uid, photoURL);
        
        // Update local state
        setProfileImage(photoURL);
        
        Alert.alert(t('common_success'), t('settings_profile_image_updated'));
      }
    } catch {
      Alert.alert(t('common_error'), t('settings_profile_image_failed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const getDaysWriting = () => {
    if (!stats.firstEntryDate) return 0;
    const diff = new Date().getTime() - stats.firstEntryDate.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const themed = useMemo(
    () => ({
      screenBg: { backgroundColor: theme.colors.backgroundLight },
      headerBg: { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border },
      headingText: { color: theme.colors.text, fontFamily: theme.fonts.headingFamily },
      primaryText: { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily },
      secondaryText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily },
      cardBg: { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
      accentBg: { backgroundColor: theme.colors.primary },
      accentText: { color: theme.colors.primary },
      modalBg: { backgroundColor: theme.colors.background },
      inputBg: { borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily },
      inputPlaceholder: theme.colors.textSecondary,
      neutralButton: { backgroundColor: theme.colors.backgroundLight },
    }),
    [theme],
  );

  return (
    <View style={[styles.container, themed.screenBg]}>
      {/* Header */}
      <View style={[styles.header, themed.headerBg]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, themed.accentText]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themed.headingText]}>{t('profile_header')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Info Card */}
        <View style={[styles.userCard, themed.cardBg]}>
          <TouchableOpacity 
            style={styles.avatarContainer} 
            onPress={handleChangeProfileImage}
            disabled={uploadingImage}
          >
            <View style={[styles.avatar, themed.accentBg]}>
              {uploadingImage ? (
                <ActivityIndicator size="large" color={colors.white} />
              ) : profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {user?.email?.charAt(0).toUpperCase() || '?'}
                </Text>
              )}
            </View>
            <View style={[styles.editBadge, themed.accentBg]}>
              <Text style={styles.editBadgeText}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.userEmail, themed.secondaryText]}>{user?.email}</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsContainer}>
          <Text style={[styles.sectionTitle, themed.primaryText]}>{t('profile_stats_title')}</Text>
          
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, themed.cardBg]}>
              <Text style={[styles.statNumber, themed.accentText]}>{stats.totalEntries}</Text>
              <Text style={[styles.statLabel, themed.secondaryText]}>{t('profile_entries')}</Text>
            </View>
            
            <View style={[styles.statCard, themed.cardBg]}>
              <Text style={[styles.statNumber, themed.accentText]}>{stats.totalImages}</Text>
              <Text style={[styles.statLabel, themed.secondaryText]}>{t('profile_images')}</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, themed.cardBg]}>
              <Text style={[styles.statNumber, themed.accentText]}>{stats.currentStreak}</Text>
              <Text style={[styles.statLabel, themed.secondaryText]}>{t('profile_streak')}</Text>
            </View>
            
            <View style={[styles.statCard, themed.cardBg]}>
              <Text style={[styles.statNumber, themed.accentText]}>{stats.longestStreak}</Text>
              <Text style={[styles.statLabel, themed.secondaryText]}>{t('profile_longest_streak')}</Text>
            </View>
          </View>

          {stats.firstEntryDate && (
            <View style={[styles.fullStatCard, themed.cardBg]}>
              <Text style={[styles.statNumber, themed.accentText]}>{getDaysWriting()}</Text>
              <Text style={[styles.statLabel, themed.secondaryText]}>{t('profile_days_written')}</Text>
              <Text style={[styles.statSubLabel, themed.secondaryText]}>
                {t('profile_started')} {stats.firstEntryDate.toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Saavutukset-linkki */}
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={[styles.achievementsButton, themed.cardBg]}
            onPress={() => navigation.navigate('Achievements')}
          >
            <View style={styles.achievementsButtonContent}>
              <Text style={styles.achievementsButtonIcon}>🏆</Text>
              <View style={styles.achievementsButtonTextContainer}>
                <Text style={[styles.achievementsButtonTitle, themed.primaryText]}>{t('profile_achievements_title')}</Text>
                <Text style={[styles.achievementsButtonSubtitle, themed.secondaryText]}>
                  {t('profile_achievements_subtitle')}
                </Text>
              </View>
            </View>
            <Text style={[styles.achievementsButtonArrow, themed.secondaryText]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Asetukset-linkki */}
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={[styles.achievementsButton, themed.cardBg]}
            onPress={() => navigation.navigate('Settings')}
          >
            <View style={styles.achievementsButtonContent}>
              <Text style={styles.achievementsButtonIcon}>⚙️</Text>
              <View style={styles.achievementsButtonTextContainer}>
                <Text style={[styles.achievementsButtonTitle, themed.primaryText]}>{t('profile_settings_title')}</Text>
                <Text style={[styles.achievementsButtonSubtitle, themed.secondaryText]}>
                  {t('profile_settings_subtitle')}
                </Text>
              </View>
            </View>
            <Text style={[styles.achievementsButtonArrow, themed.secondaryText]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Asetukset */}
        <View style={styles.settingsContainer}>
          <Text style={[styles.sectionTitle, themed.primaryText]}>{t('profile_settings_title')}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>{t('profile_logout')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteText}>{t('profile_delete_account')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, themed.secondaryText, { fontFamily: theme.fonts.bodyFamily }]}>
            {t('profile_footer')}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showDeletePasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingAccount) {
            setShowDeletePasswordModal(false);
          }
        }}
      >
        <View style={styles.deleteModalBackdrop}>
          <View style={[styles.deleteModalCard, themed.modalBg]}>
            <Text style={[styles.deleteModalTitle, themed.primaryText]}>{t('profile_delete_modal_title')}</Text>
            <Text style={[styles.deleteModalText, themed.secondaryText]}>
              {t('profile_delete_modal_body')}
            </Text>

            <TextInput
              style={[styles.deletePasswordInput, themed.inputBg]}
              placeholder={t('profile_delete_modal_placeholder')}
              placeholderTextColor={themed.inputPlaceholder}
              secureTextEntry
              editable={!deletingAccount}
              value={deletePassword}
              onChangeText={setDeletePassword}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalButton, styles.deleteModalCancelButton]}
                onPress={() => {
                  if (!deletingAccount) {
                    setShowDeletePasswordModal(false);
                    setDeletePassword('');
                  }
                }}
                disabled={deletingAccount}
              >
                <Text style={[styles.deleteModalCancelText, themed.primaryText]}>{t('common_cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteModalButton,
                  styles.deleteModalDeleteButton,
                  (!deletePassword.trim() || deletingAccount) && styles.deleteModalDeleteButtonDisabled,
                ]}
                onPress={async () => {
                  if (!deletePassword.trim()) {
                    return;
                  }

                  try {
                    setDeletingAccount(true);
                    await deleteAccount(deletePassword);
                    setShowDeletePasswordModal(false);
                    setDeletePassword('');
                    Alert.alert(t('profile_delete_success_title'), t('profile_delete_success'));
                  } catch (error: any) {
                    Alert.alert(
                      t('common_error'),
                      error?.message || t('profile_delete_failed')
                    );
                  } finally {
                    setDeletingAccount(false);
                  }
                }}
                disabled={!deletePassword.trim() || deletingAccount}
              >
                <Text style={styles.deleteModalDeleteText}>
                  {deletingAccount ? t('common_deleting') : t('profile_delete_button')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm,
  },
  backButton: {
    width: 40,
  },
  backButtonText: {
    fontSize: 32,
    color: colors.primary,
  },
  headerTitle: {
    ...commonStyles.heading1,
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  userCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    ...shadows.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadgeText: {
    fontSize: 14,
  },
  userName: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  userEmail: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  statsContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  fullStatCard: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: typography.fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.medium,
  },
  statSubLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  settingsContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  settingCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  settingTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  achievementsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  achievementsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  achievementsButtonIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  achievementsButtonTextContainer: {
    flex: 1,
  },
  achievementsButtonTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  achievementsButtonSubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  achievementsButtonArrow: {
    fontSize: 28,
    color: colors.textSecondary,
  },
  actionsContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.error,
    ...shadows.sm,
  },
  logoutIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  logoutText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.error,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffebee',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#c62828',
    marginTop: spacing.md,
    ...shadows.sm,
  },
  deleteIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  deleteText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: '#c62828',
  },
  footer: {
    alignItems: 'center',
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  footerText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    fontFamily: Platform.select({
      ios: 'Snell Roundhand',
      android: 'cursive',
      default: undefined,
    }),
  },
  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  deleteModalCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  deleteModalTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  deleteModalText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  deletePasswordInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    marginBottom: spacing.md,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteModalButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  deleteModalCancelButton: {
    backgroundColor: colors.gray100,
  },
  deleteModalCancelText: {
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  deleteModalDeleteButton: {
    backgroundColor: colors.error,
  },
  deleteModalDeleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteModalDeleteText: {
    color: colors.white,
    fontWeight: typography.fontWeights.semibold,
  },
});
