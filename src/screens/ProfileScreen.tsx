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

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
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

  const calculateStreaks = (entries: DiaryEntry[]) => {
    if (entries.length === 0) return { current: 0, longest: 0 };

    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check current streak
    const latestEntry = new Date(sortedEntries[0].date);
    latestEntry.setHours(0, 0, 0, 0);
    const daysSinceLatest = Math.floor((today.getTime() - latestEntry.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLatest <= 1) {
      currentStreak = 1;
      
      // Continue counting streak
      for (let i = 1; i < sortedEntries.length; i++) {
        const current = new Date(sortedEntries[i - 1].date);
        const previous = new Date(sortedEntries[i].date);
        current.setHours(0, 0, 0, 0);
        previous.setHours(0, 0, 0, 0);
        
        const diff = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diff === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 1; i < sortedEntries.length; i++) {
      const current = new Date(sortedEntries[i - 1].date);
      const previous = new Date(sortedEntries[i].date);
      current.setHours(0, 0, 0, 0);
      previous.setHours(0, 0, 0, 0);
      
      const diff = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diff === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }
    
    longestStreak = Math.max(longestStreak, currentStreak, 1);

    return { current: currentStreak, longest: longestStreak };
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

  const handleChangeProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Lupa tarvitaan', 'Tarvitsemme luvan päästäksemme kuvagalleriaan.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  // Tavoitteet ja palkinnot
  const achievements = [
    { id: 1, name: 'Ensimmäinen askel', icon: '🎖️', requirement: 1, type: 'streak', description: 'Kirjoita ensimmäinen merkintäsi' },
    { id: 2, name: 'Sitoutunut', icon: '🔥', requirement: 3, type: 'streak', description: '3 päivän putki' },
    { id: 3, name: 'Viikon voittaja', icon: '⭐', requirement: 7, type: 'streak', description: '7 päivän putki' },
    { id: 4, name: 'Kuukauden mestari', icon: '🏆', requirement: 30, type: 'streak', description: '30 päivän putki' },
    { id: 5, name: 'Kirjoittaja', icon: '✍️', requirement: 10, type: 'entries', description: '10 merkintää' },
    { id: 6, name: 'Tarinankertoija', icon: '📖', requirement: 50, type: 'entries', description: '50 merkintää' },
    { id: 7, name: 'Muistelija', icon: '📚', requirement: 100, type: 'entries', description: '100 merkintää' },
    { id: 8, name: 'Valokuvaaja', icon: '📷', requirement: 50, type: 'images', description: '50 kuvaa' },
  ];

  const getUnlockedAchievements = () => {
    return achievements.filter(achievement => {
      if (achievement.type === 'streak') {
        return stats.longestStreak >= achievement.requirement;
      } else if (achievement.type === 'entries') {
        return stats.totalEntries >= achievement.requirement;
      } else if (achievement.type === 'images') {
        return stats.totalImages >= achievement.requirement;
      }
      return false;
    });
  };

  const getNextAchievement = () => {
    const locked = achievements.filter(achievement => {
      if (achievement.type === 'streak') {
        return stats.longestStreak < achievement.requirement;
      } else if (achievement.type === 'entries') {
        return stats.totalEntries < achievement.requirement;
      } else if (achievement.type === 'images') {
        return stats.totalImages < achievement.requirement;
      }
      return true;
    }).sort((a, b) => a.requirement - b.requirement);
    
    return locked[0];
  };

  const getProgressToNext = () => {
    const next = getNextAchievement();
    if (!next) return { progress: 100, current: 0, target: 0 };
    
    let current = 0;
    if (next.type === 'streak') {
      current = stats.currentStreak;
    } else if (next.type === 'entries') {
      current = stats.totalEntries;
    } else if (next.type === 'images') {
      current = stats.totalImages;
    }
    
    const progress = Math.min((current / next.requirement) * 100, 100);
    return { progress, current, target: next.requirement };
  };

  const getMotivationalMessage = () => {
    const { current } = getProgressToNext();
    const next = getNextAchievement();
    
    if (!next) return 'Olet saavuttanut kaikki tavoitteet! 🎉';
    
    const remaining = next.requirement - current;
    
    if (next.type === 'streak') {
      if (stats.currentStreak === 0) {
        return 'Aloita uusi putki kirjoittamalla tänään! 🚀';
      }
      return `Hieno putki! Vielä ${remaining} päivää tavoitteeseen "${next.name}" 🔥`;
    } else if (next.type === 'entries') {
      return `Kirjoita vielä ${remaining} merkintää saavuttaaksesi "${next.name}" ✨`;
    } else if (next.type === 'images') {
      return `Lisää vielä ${remaining} kuvaa saavuttaaksesi "${next.name}" 📸`;
    }
    
    return 'Jatka hyvää työtä! 💪';
  };

  const unlockedAchievements = getUnlockedAchievements();
  const nextAchievement = getNextAchievement();
  const progressData = getProgressToNext();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profiili</Text>
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

        {/* Seuraava tavoite */}
        {nextAchievement && (
          <View style={styles.goalContainer}>
            <Text style={styles.sectionTitle}>Seuraava tavoite</Text>
            
            <View style={styles.nextGoalCard}>
              <View style={styles.goalHeader}>
                <Text style={styles.goalIcon}>{nextAchievement.icon}</Text>
                <View style={styles.goalInfo}>
                  <Text style={styles.goalName}>{nextAchievement.name}</Text>
                  <Text style={styles.goalDescription}>{nextAchievement.description}</Text>
                </View>
              </View>
              
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressData.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {progressData.current} / {progressData.target}
                </Text>
              </View>
              
              <Text style={styles.motivationalText}>{getMotivationalMessage()}</Text>
            </View>
          </View>
        )}

        {/* Saavutukset */}
        <View style={styles.achievementsContainer}>
          <Text style={styles.sectionTitle}>
            Saavutukset ({unlockedAchievements.length}/{achievements.length})
          </Text>
          
          <View style={styles.achievementsGrid}>
            {achievements.map((achievement) => {
              const isUnlocked = unlockedAchievements.some(a => a.id === achievement.id);
              return (
                <View 
                  key={achievement.id} 
                  style={[
                    styles.achievementCard,
                    !isUnlocked && styles.achievementLocked
                  ]}
                >
                  <Text style={[
                    styles.achievementIcon,
                    !isUnlocked && styles.achievementIconLocked
                  ]}>
                    {achievement.icon}
                  </Text>
                  <Text style={[
                    styles.achievementName,
                    !isUnlocked && styles.achievementNameLocked
                  ]}>
                    {achievement.name}
                  </Text>
                  {isUnlocked && (
                    <View style={styles.unlockedBadge}>
                      <Text style={styles.unlockedBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>👋</Text>
            <Text style={styles.logoutText}>Kirjaudu ulos</Text>
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
  goalContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  nextGoalCard: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  goalIcon: {
    fontSize: 40,
    marginRight: spacing.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalName: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  goalDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressBar: {
    height: 12,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  progressText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    fontWeight: typography.fontWeights.medium,
  },
  motivationalText: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: typography.fontWeights.medium,
    fontStyle: 'italic',
  },
  achievementsContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  achievementCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.sm,
  },
  achievementLocked: {
    opacity: 0.4,
    backgroundColor: colors.gray50,
  },
  achievementIcon: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  achievementIconLocked: {
    opacity: 0.5,
  },
  achievementName: {
    fontSize: typography.fontSizes.xs,
    color: colors.text,
    textAlign: 'center',
    fontWeight: typography.fontWeights.medium,
  },
  achievementNameLocked: {
    color: colors.textSecondary,
  },
  unlockedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  unlockedBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: typography.fontWeights.bold,
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
