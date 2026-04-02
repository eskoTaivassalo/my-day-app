import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { getEntries, uploadProfileImage, updateUserProfile, getUserProfile } from '../services/diaryService';
import { DiaryEntry } from '../types/DiaryEntry';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';
import { calculateStreaks } from '../utils/achievementUtils';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, deleteAccount } = useAuth();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
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
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };


  const loadStats = async () => {
    if (!user) return;

    try {
      const userEntries = await getEntries(user.uid);
      setEntries(userEntries);

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
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Kirjaudu ulos',
      'Haluatko varmasti kirjautua ulos?',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Kirjaudu ulos',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              Alert.alert('Virhe', 'Uloskirjautuminen epäonnistui');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Poista tili',
      'Haluatko varmasti poistaa tilisi? Tämä poistaa KAIKKI tietosi pysyvästi (päiväkirjamerkinnät, dokumentit, kuvat). Tätä toimintoa EI VOI peruuttaa!',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Poista tili',
          style: 'destructive',
          onPress: () => {
            // Kaksoisvarmistus
            Alert.alert(
              'Viimeinen varmistus',
              'Oletko TÄYSIN VARMA? Kaikki tietosi poistetaan pysyvästi.',
              [
                { text: 'Peruuta', style: 'cancel' },
                {
                  text: 'Kyllä, poista',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      Alert.alert('Poistetaan...', 'Odota hetki, tili poistetaan.');
                      await deleteAccount();
                      Alert.alert('Valmis', 'Tilisi on poistettu.');
                    } catch (error: any) {
                      Alert.alert(
                        'Virhe',
                        error.message || 'Tilin poistaminen epäonnistui. Kokeile kirjautua uudelleen ja yritä sitten uudestaan.'
                      );
                    }
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
        Alert.alert('Lupa tarvitaan', 'Tarvitsemme luvan päästäksemme kuvagalleriaan.');
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
        
        Alert.alert('Onnistui!', 'Profiilikuva päivitetty');
      }
    } catch (error) {
      console.error('Error changing profile image:', error);
      Alert.alert('Virhe', 'Profiilikuvan päivittäminen epäonnistui');
    } finally {
      setUploadingImage(false);
    }
  };

  const getDaysWriting = () => {
    if (!stats.firstEntryDate) return 0;
    const diff = new Date().getTime() - stats.firstEntryDate.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>✨ Päiväkirjani</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Info Card */}
        <View style={styles.userCard}>
          <TouchableOpacity 
            style={styles.avatarContainer} 
            onPress={handleChangeProfileImage}
            disabled={uploadingImage}
          >
            <View style={styles.avatar}>
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
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeText}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.displayName || 'Käyttäjä'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Tilastot</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalEntries}</Text>
              <Text style={styles.statLabel}>Merkintää</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalImages}</Text>
              <Text style={styles.statLabel}>Kuvaa</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.currentStreak}</Text>
              <Text style={styles.statLabel}>Päivän putki</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.longestStreak}</Text>
              <Text style={styles.statLabel}>Pisin putki</Text>
            </View>
          </View>

          {stats.firstEntryDate && (
            <View style={styles.fullStatCard}>
              <Text style={styles.statNumber}>{getDaysWriting()}</Text>
              <Text style={styles.statLabel}>Päivää kirjoittanut</Text>
              <Text style={styles.statSubLabel}>
                Aloitettu {stats.firstEntryDate.toLocaleDateString('fi-FI', {
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
            style={styles.achievementsButton}
            onPress={() => navigation.navigate('Achievements')}
          >
            <View style={styles.achievementsButtonContent}>
              <Text style={styles.achievementsButtonIcon}>🏆</Text>
              <View style={styles.achievementsButtonTextContainer}>
                <Text style={styles.achievementsButtonTitle}>Saavutukset</Text>
                <Text style={styles.achievementsButtonSubtitle}>
                  Katso kaikki saavutuksesi
                </Text>
              </View>
            </View>
            <Text style={styles.achievementsButtonArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Asetukset-linkki */}
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.achievementsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <View style={styles.achievementsButtonContent}>
              <Text style={styles.achievementsButtonIcon}>⚙️</Text>
              <View style={styles.achievementsButtonTextContainer}>
                <Text style={styles.achievementsButtonTitle}>Asetukset</Text>
                <Text style={styles.achievementsButtonSubtitle}>
                  Hallitse sovelluksen asetuksia
                </Text>
              </View>
            </View>
            <Text style={styles.achievementsButtonArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Asetukset */}
        <View style={styles.settingsContainer}>
          <Text style={styles.sectionTitle}>Asetukset</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>👋</Text>
            <Text style={styles.logoutText}>Kirjaudu ulos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteIcon}>⚠️</Text>
            <Text style={styles.deleteText}>Poista tili</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>My Day App v1.0</Text>
        </View>
      </ScrollView>
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
  },
});
