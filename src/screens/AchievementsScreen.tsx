import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getUnlockedAchievementIds } from '../services/achievementStorageService';
import {
  achievements,
  getLocalizedAchievement,
  Achievement,
} from '../utils/achievementUtils';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

export default function AchievementsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const [unlockedIds, setUnlockedIds] = useState<number[]>([]);

  const loadAchievements = useCallback(async () => {
    if (!user) return;

    try {
      const ids = await getUnlockedAchievementIds(user.uid);
      setUnlockedIds(ids);
    } catch {
      setUnlockedIds([]);
    }
  }, [user]);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  const renderAchievement = useCallback(({ item }: { item: Achievement }) => {
    const isUnlocked = unlockedIds.includes(item.id);

    return (
      <View
        style={[
          styles.achievementItem,
          { backgroundColor: isDark ? '#111827' : colors.white },
          !isUnlocked && [styles.achievementItemLocked, { backgroundColor: isDark ? '#1E293B' : colors.gray100 }],
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
              { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily },
              !isUnlocked && [styles.achievementNameLocked, { color: theme.colors.textSecondary }],
            ]}
          >
            {item.name}
          </Text>
          <Text
            style={[
              styles.achievementDescription,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily },
              !isUnlocked && [styles.achievementDescriptionLocked, { color: theme.colors.textSecondary }],
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
  }, [unlockedIds]);

  const groupLabelByType = useCallback((type: Achievement['type']) => {
    switch (type) {
      case 'streak':
        return t('achievements_group_streak');
      case 'entries':
        return t('achievements_group_entries');
      case 'images':
        return t('achievements_group_images');
      case 'words':
        return t('achievements_group_words');
      case 'multiDay':
        return t('achievements_group_productivity');
      case 'shared':
        return t('achievements_group_sharing');
      case 'location':
        return t('achievements_group_locations');
      case 'earlyBird':
        return t('achievements_group_mornings');
      case 'nightOwl':
        return t('achievements_group_evenings');
      case 'weekend':
        return t('achievements_group_weekends');
      case 'photoCollection':
        return t('achievements_group_photo_collections');
      default:
        return t('achievements_group_other');
    }
  }, [t]);

  const groupedAchievements = useMemo(() => {
    const groups: { [key: string]: Achievement[] } = {};

    const sortedByTypeAndRequirement = [...achievements].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.requirement - b.requirement;
    });

    sortedByTypeAndRequirement.forEach((baseAchievement) => {
      const achievement = getLocalizedAchievement(baseAchievement, language);
      const groupName = groupLabelByType(baseAchievement.type);
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(achievement);
    });

    return groups;
  }, [groupLabelByType, language]);

  const unlockedGroups = useMemo(() => {
    return Object.entries(groupedAchievements)
      .map(([groupName, groupAchievements]) => [
        groupName,
        groupAchievements.filter((achievement) => unlockedIds.includes(achievement.id)),
      ] as const)
      .filter(([, groupAchievements]) => groupAchievements.length > 0);
  }, [groupedAchievements, unlockedIds]);

  const inProgressGroups = useMemo(() => {
    return Object.entries(groupedAchievements)
      .map(([groupName, groupAchievements]) => [
        groupName,
        groupAchievements.filter((achievement) => !unlockedIds.includes(achievement.id)),
      ] as const)
      .filter(([, groupAchievements]) => groupAchievements.length > 0);
  }, [groupedAchievements, unlockedIds]);

  const unlockedCount = unlockedIds.length;
  const totalCount = achievements.length;
  const progressPercent = useMemo(() => {
    if (totalCount === 0) return 0;
    return (unlockedCount / totalCount) * 100;
  }, [totalCount, unlockedCount]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }] }>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('common_back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('achievements_header')}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Progress Summary */}
      <View style={[styles.progressContainer, { backgroundColor: theme.colors.white }] }>
        <Text style={[styles.progressText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>
          {t('achievements_progress', { unlocked: unlockedCount, total: totalCount })}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: isDark ? '#1E293B' : colors.gray200 }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%`, backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary },
            ]}
          />
        </View>
      </View>

      {/* Achievements List */}
      <ScrollView style={styles.scrollView}>
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>Saavutetut</Text>
        </View>
        {unlockedGroups.map(([groupName, groupAchievements]) => (
          <View key={`unlocked-${groupName}`} style={styles.group}>
            <Text style={styles.groupSubtitle}>{groupName}</Text>
            {groupAchievements.map((achievement) => (
              <React.Fragment key={achievement.id}>{renderAchievement({ item: achievement })}</React.Fragment>
            ))}
          </View>
        ))}

        <View style={styles.groupDivider} />

        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>Kesken</Text>
        </View>
        {inProgressGroups.map(([groupName, groupAchievements]) => (
          <View key={`progress-${groupName}`} style={styles.group}>
            <Text style={styles.groupSubtitle}>{groupName}</Text>
            {groupAchievements.map((achievement) => (
              <React.Fragment key={achievement.id}>{renderAchievement({ item: achievement })}</React.Fragment>
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
  groupSubtitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  groupDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
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
