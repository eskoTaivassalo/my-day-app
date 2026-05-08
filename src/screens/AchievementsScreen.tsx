import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  addUnlockedAchievement,
  getCachedUnlockedAchievementIds,
  getUnlockedAchievementIds,
} from '../services/achievementStorageService';
import { getEntriesFast } from '../services/diaryService';
import {
  achievements,
  calculateStats,
  getUnlockedAchievements,
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
  const [loading, setLoading] = useState(true);
  const [displayedUnlockedCount, setDisplayedUnlockedCount] = useState(0);
  const loadRequestIdRef = useRef(0);
  const hasReconciledFromStatsRef = useRef(false);

  useEffect(() => {
    hasReconciledFromStatsRef.current = false;
  }, [user?.uid]);

  const reconcileFromStats = useCallback(async (persistedIds: number[]) => {
    if (!user || hasReconciledFromStatsRef.current) return;

    hasReconciledFromStatsRef.current = true;

    try {
      const allEntries = await getEntriesFast(user.uid);
      const stats = calculateStats(allEntries);
      const idsFromStats = getUnlockedAchievements(stats).map((achievement) => achievement.id);
      const missingIds = idsFromStats.filter((id) => !persistedIds.includes(id));

      if (missingIds.length > 0) {
        void Promise.all(missingIds.map((id) => addUnlockedAchievement(user.uid, id))).catch(() => undefined);
      }

      setUnlockedIds((prev) => Array.from(new Set([...prev, ...idsFromStats])));
    } catch {
      hasReconciledFromStatsRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const cachedIds = getCachedUnlockedAchievementIds(user.uid);
    if (cachedIds) {
      setUnlockedIds(cachedIds);
      setDisplayedUnlockedCount(cachedIds.length);
      setLoading(false);
    }
  }, [user]);

  const loadAchievements = useCallback(async () => {
    if (!user) return;

    const requestId = ++loadRequestIdRef.current;
    const cachedIds = getCachedUnlockedAchievementIds(user.uid);

    try {
      if (!cachedIds) {
        setLoading(true);
      }
      const ids = await getUnlockedAchievementIds(user.uid);
      if (requestId === loadRequestIdRef.current) {
        setUnlockedIds(ids);
        void reconcileFromStats(ids);
      }
    } catch {
      if (requestId === loadRequestIdRef.current) {
        setUnlockedIds([]);
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [reconcileFromStats, user]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadAchievements();
      });

      return () => {
        task.cancel();
      };
    }, [loadAchievements])
  );

  useEffect(() => {
    const target = unlockedIds.length;
    let frameId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const step = () => {
      setDisplayedUnlockedCount((prev) => {
        if (prev === target) {
          return prev;
        }

        const diff = target - prev;
        const increment = diff > 0 ? Math.max(1, Math.ceil(diff / 6)) : Math.min(-1, Math.floor(diff / 6));
        const next = prev + increment;

        if (next !== target) {
          timeoutId = setTimeout(() => {
            frameId = requestAnimationFrame(step);
          }, 32);
        }

        return next;
      });
    };

    frameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [unlockedIds.length]);

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
    return (displayedUnlockedCount / totalCount) * 100;
  }, [displayedUnlockedCount, totalCount]);

  const sections = useMemo(() => {
    const nextSections: Array<{ title: string; data: Achievement[]; key: string }> = [];

    if (unlockedGroups.length > 0) {
      nextSections.push(...unlockedGroups.map(([groupName, groupAchievements]) => ({
        title: groupName,
        data: groupAchievements,
        key: `unlocked-${groupName}`,
      })));
    }

    if (inProgressGroups.length > 0) {
      nextSections.push(...inProgressGroups.map(([groupName, groupAchievements]) => ({
        title: groupName,
        data: groupAchievements,
        key: `progress-${groupName}`,
      })));
    }

    return nextSections;
  }, [inProgressGroups, unlockedGroups]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; key: string } }) => {
      const isUnlockedSection = section.key.startsWith('unlocked-');
      return (
        <View style={styles.group}>
          <Text style={[styles.groupSubtitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
            {section.title}
          </Text>
          {isUnlockedSection ? null : null}
        </View>
      );
    },
    [theme.colors.textSecondary, theme.fonts.bodyFamily]
  );

  const listHeader = useMemo(() => (
    <>
      <View style={[styles.progressContainer, { backgroundColor: theme.colors.white }] }>
        <Text style={[styles.progressText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>
          {t('achievements_progress', { unlocked: displayedUnlockedCount, total: totalCount })}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: isDark ? '#1E293B' : colors.gray200 }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%`, backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary },
            ]}
          />
        </View>
        {loading && (
          <View style={styles.loadingInline}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.loadingInlineText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
              {t('common_loading')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('achievements_section_unlocked')}</Text>
      </View>
      {unlockedGroups.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('achievements_empty_unlocked')}</Text>
        </View>
      ) : null}

      {unlockedGroups.length > 0 && inProgressGroups.length > 0 ? <View style={styles.groupDivider} /> : null}

      <View style={styles.group}>
        <Text style={[styles.groupTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('achievements_section_in_progress')}</Text>
      </View>
    </>
  ), [displayedUnlockedCount, isDark, loading, progressPercent, t, theme.colors.primary, theme.colors.primaryDark, theme.colors.text, theme.colors.textSecondary, theme.colors.white, theme.fonts.bodyFamily, totalCount, unlockedGroups.length, inProgressGroups.length]);

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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderAchievement}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={8}
        removeClippedSubviews
      />
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
  listContent: {
    paddingBottom: spacing.xl,
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
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  loadingInlineText: {
    fontSize: typography.fontSizes.sm,
  },
  emptyState: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.fontSizes.sm,
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
