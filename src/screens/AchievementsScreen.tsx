import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getEntries } from '../services/diaryService';
import { getUnlockedAchievementIds } from '../services/achievementStorageService';
import {
  achievements,
  calculateStats,
  getUnlockedAchievements,
  Achievement,
} from '../utils/achievementUtils';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

export default function AchievementsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [unlockedIds, setUnlockedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadAchievements();
    }
  }, [user]);

  const loadAchievements = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const ids = await getUnlockedAchievementIds(user.uid);
      setUnlockedIds(ids);
    } catch (error) {
      console.error('Error loading achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderAchievement = ({ item }: { item: Achievement }) => {
    const isUnlocked = unlockedIds.includes(item.id);

    return (
      <View
        style={[
          styles.achievementItem,
          !isUnlocked && styles.achievementItemLocked,
        ]}
      >
        <View style={styles.achievementIconContainer}>
          <Text
            style={[
              styles.achievementIcon,
              !isUnlocked && styles.achievementIconLocked,
            ]}
          >
            {item.icon}
          </Text>
        </View>
        <View style={styles.achievementContent}>
          <Text
            style={[
              styles.achievementName,
              !isUnlocked && styles.achievementNameLocked,
            ]}
          >
            {item.name}
          </Text>
          <Text
            style={[
              styles.achievementDescription,
              !isUnlocked && styles.achievementDescriptionLocked,
            ]}
          >
            {item.description}
          </Text>
        </View>
        {isUnlocked && (
          <View style={styles.unlockedBadge}>
            <Text style={styles.unlockedBadgeText}>✓</Text>
          </View>
        )}
      </View>
    );
  };

  const groupedAchievements = React.useMemo(() => {
    const groups: { [key: string]: Achievement[] } = {};
    
    achievements.forEach((achievement) => {
      const type = achievement.type;
      let groupName = '';
      
      switch (type) {
        case 'streak':
          groupName = '🔥 Päivittäiset putket';
          break;
        case 'entries':
          groupName = '📝 Merkinnät';
          break;
        case 'images':
          groupName = '📷 Kuvat';
          break;
        case 'words':
          groupName = '💬 Sanamäärät';
          break;
        case 'multiDay':
          groupName = '⚡ Tuottavuus';
          break;
        case 'shared':
          groupName = '🔗 Jakamiset';
          break;
        case 'location':
          groupName = '📍 Sijainnit';
          break;
        case 'earlyBird':
          groupName = '🌅 Aamut';
          break;
        case 'nightOwl':
          groupName = '🦉 Illat';
          break;
        case 'weekend':
          groupName = '🎉 Viikonloput';
          break;
        case 'photoCollection':
          groupName = '🎞️ Kuvakokoelmat';
          break;
        default:
          groupName = '🏆 Muut';
      }
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(achievement);
    });
    
    return groups;
  }, []);

  const unlockedCount = unlockedIds.length;
  const totalCount = achievements.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Takaisin</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saavutukset</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Progress Summary */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {unlockedCount} / {totalCount} avattu
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(unlockedCount / totalCount) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* Achievements List */}
      <ScrollView style={styles.scrollView}>
        {Object.entries(groupedAchievements).map(([groupName, groupAchievements]) => (
          <View key={groupName} style={styles.group}>
            <Text style={styles.groupTitle}>{groupName}</Text>
            {groupAchievements.map((achievement) => (
              <View key={achievement.id}>
                {renderAchievement({ item: achievement })}
              </View>
            ))}
          </View>
        ))}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingTop: spacing.xl + 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray50,
    ...shadows.sm,
  },
  backButton: {
    fontSize: typography.fontSizes.lg,
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
    width: 100,
  },
  headerTitle: {
    ...commonStyles.heading1,
    fontSize: 20,
  },
  headerRight: {
    width: 100,
  },
  progressContainer: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  progressText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.gray200,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  scrollView: {
    flex: 1,
  },
  group: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  groupTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  achievementItemLocked: {
    backgroundColor: colors.gray100,
    opacity: 0.6,
  },
  achievementIconContainer: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  achievementIcon: {
    fontSize: 28,
  },
  achievementIconLocked: {
    opacity: 0.3,
    filter: 'grayscale(100%)',
  },
  achievementContent: {
    flex: 1,
  },
  achievementName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  achievementNameLocked: {
    color: colors.textSecondary,
  },
  achievementDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  achievementDescriptionLocked: {
    color: colors.gray400,
  },
  unlockedBadge: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockedBadgeText: {
    color: colors.white,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
});
