import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  Dimensions,
  InteractionManager,
  Platform,
  UIManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DiaryEntry } from '../types/DiaryEntry';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import {
  getEntriesFast,
  getUserProfile,
  ensureVideoThumbnailCached,
  resolveEntryImagesInBackground,
} from '../services/diaryService';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';
import AchievementToast from '../components/AchievementToast';
import ReminderToast from '../components/ReminderToast';
import {
  getLastReminderAlertDate,
  getTodayDateKey,
  getTodayRemindersSummary,
  getShowTodayRemindersAlert,
  setLastReminderAlertDate,
} from '../services/reminderService';
import {
  getUnlockedAchievementIds,
  addUnlockedAchievement,
} from '../services/achievementStorageService';
import {
  achievements,
  calculateStats,
  checkNewAchievements,
  getUnlockedAchievements,
  getLocalizedAchievement,
  Achievement,
  Stats,
} from '../utils/achievementUtils';
declare var global: any;
const { width } = Dimensions.get('window');
type LayoutType = 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';
const INITIAL_ENTRIES_LIMIT = 60;
const INITIAL_MEDIA_RESOLVE_LIMIT = 24;
const GREETING_BANK_SIZE = 8;
const GREETING_KEYS = [
  'timeline_greeting_bank_1',
  'timeline_greeting_bank_2',
  'timeline_greeting_bank_3',
  'timeline_greeting_bank_4',
  'timeline_greeting_bank_5',
  'timeline_greeting_bank_6',
  'timeline_greeting_bank_7',
  'timeline_greeting_bank_8',
] as const;

export default function TimelineScreen({ navigation }: any) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalEntries: 0,
    totalImages: 0,
    longestStreak: 0,
    currentStreak: 0,
    firstEntryDate: null,
    totalWords: 0,
    maxEntriesPerDay: 0,
    sharedCount: 0,
    entriesWithLocation: 0,
    earlyBirdCount: 0,
    nightOwlCount: 0,
    weekendCount: 0,
    maxImagesInEntry: 0,
  });
  const [achievementToast, setAchievementToast] = useState<Achievement | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showReminderToast, setShowReminderToast] = useState(false);
  const [reminderToastMessage, setReminderToastMessage] = useState('');
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<number[]>([]);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [showGreetingCard, setShowGreetingCard] = useState(true);
  const [videoThumbnailMap, setVideoThumbnailMap] = useState<Record<string, string>>({});
  const { user, encryptionStatus } = useAuth();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const locale = getLocaleFromLanguage(language);
  
  // Muista viimeiset tilastot joista näytettiin toast
  const lastProcessedStats = useRef<Stats | null>(null);
  const achievementBaselineHydratedRef = useRef(false);
  const entriesLoadInFlightRef = useRef(false);
  const greetingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const isFabric = Boolean((global as any).nativeFabricUIManager);
    if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    setAchievementsLoaded(false);
    lastProcessedStats.current = null;
    achievementBaselineHydratedRef.current = false;
  }, [user?.uid]);

  const setThumbnailForEntry = (entryId: string, thumbnailUri: string | null | undefined) => {
    if (!thumbnailUri) {
      return;
    }

    setVideoThumbnailMap((prev) => {
      const existing = prev[entryId];
      if (existing) {
        return prev;
      }

      return { ...prev, [entryId]: thumbnailUri };
    });
  };

  // Suodata merkinnät hakutermin perusteella vain kun data tai hakuteksti muuttuu.
  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return entries;
    }

    return entries.filter((entry) => {
      const titleMatch = entry.title.toLowerCase().includes(query);
      const contentMatch = entry.content.toLowerCase().includes(query);
      const locationMatch = entry.location?.address?.toLowerCase().includes(query) || false;

      return titleMatch || contentMatch || locationMatch;
    });
  }, [entries, searchQuery]);

  const timelineDisplayName = useMemo(() => {
    const emailNameFallback = user?.email
      ? user.email
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase())
      : '';

    return user?.displayName?.trim() || emailNameFallback || t('profile_user_fallback');
  }, [t, user?.displayName, user?.email]);

  const dailyGreetingSeed = useMemo(() => {
    const dayKey = getTodayDateKey();
    const source = `${dayKey}|${user?.uid ?? 'anon'}`;
    let hash = 0;

    for (let index = 0; index < source.length; index += 1) {
      hash = (hash << 5) - hash + source.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash);
  }, [user?.uid]);

  const greetingIndex = useMemo(
    () => (dailyGreetingSeed % GREETING_BANK_SIZE) + 1,
    [dailyGreetingSeed]
  );

  const dailyGreetingText = useMemo(
    () =>
      t(GREETING_KEYS[greetingIndex - 1], {
        name: timelineDisplayName,
      }),
    [greetingIndex, t, timelineDisplayName]
  );

  const greetingStyleVariant = useMemo(() => {
    const variant = (dailyGreetingSeed % 4) + 1;

    switch (variant) {
      case 1:
        return {
          fontFamily: theme.fonts.headingFamily,
          fontStyle: 'normal' as const,
          letterSpacing: 0.2,
          color: theme.colors.text,
        };
      case 2:
        return {
          fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
          fontStyle: 'italic' as const,
          letterSpacing: 0.4,
          color: theme.colors.primary,
        };
      case 3:
        return {
          fontFamily: theme.fonts.bodyFamily,
          fontStyle: 'normal' as const,
          letterSpacing: 0.8,
          color: theme.colors.text,
        };
      default:
        return {
          fontFamily: Platform.OS === 'ios' ? 'AvenirNext-DemiBold' : theme.fonts.headingFamily,
          fontStyle: 'normal' as const,
          letterSpacing: 0.1,
          color: theme.colors.secondary,
        };
    }
  }, [dailyGreetingSeed, theme.colors.primary, theme.colors.secondary, theme.colors.text, theme.fonts.bodyFamily, theme.fonts.headingFamily]);

  useEffect(() => {
    setShowGreetingCard(true);
    greetingAnim.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(greetingAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(greetingAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        setShowGreetingCard(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [dailyGreetingText, greetingAnim]);

  const themed = useMemo(
    () => ({
      screenBg: { backgroundColor: theme.colors.backgroundLight },
      headerBg: { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border },
      headingText: { color: theme.colors.text, fontFamily: theme.fonts.headingFamily },
      chipBg: { backgroundColor: theme.colors.backgroundLight },
      searchBg: { backgroundColor: theme.colors.backgroundLight },
      searchBorder: { borderColor: theme.colors.border },
      searchText: { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily },
      mutedText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily },
      linkText: { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily },
      cardBg: { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
      cardTitle: { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily },
      progress: { backgroundColor: theme.colors.primary },
      primaryText: { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily },
      secondaryText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily },
      dateBg: { backgroundColor: theme.colors.primary },
      emptyButtonBg: { backgroundColor: theme.colors.primary },
      fabBg: { backgroundColor: theme.colors.primary },
    }),
    [theme],
  );

  // Ladataan entryt uudelleen kun palataan tähän screeniin
  useFocusEffect(
    React.useCallback(() => {
      if (user && encryptionStatus === 'ready') {
        // Lataa saavutukset ensin, sitten entries
        loadUnlockedAchievements().then((ids) => {
          loadEntries(ids).then(() => {
            maybeShowTodayReminders({ ignoreLastShown: true });
          });
        });
        loadUserProfile();
      }
    }, [user, encryptionStatus])
  );

  const loadUnlockedAchievements = async (): Promise<number[]> => {
    if (!user) return [];
    
    try {
      const ids = await getUnlockedAchievementIds(user.uid);
      setUnlockedAchievementIds(ids);
      setAchievementsLoaded(true);
      return ids;
    } catch (error) {
      setAchievementsLoaded(true);
      return [];
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const profile = await getUserProfile(user.uid);
      if (profile?.photoURL) {
        setProfileImage(profile.photoURL);
      }
    } catch (error) {
    }
  };

  const loadEntries = async (unlockedIds?: number[]) => {
    if (!user || encryptionStatus !== 'ready') return;

    // Estä päällekkäiset lataukset (esim. focus + strict mode -tuplakutsu)
    if (entriesLoadInFlightRef.current) {
      return;
    }
    entriesLoadInFlightRef.current = true;
    
    // Use provided IDs or fall back to state (for refresh scenarios)
    const previouslyUnlockedIds = unlockedIds !== undefined ? unlockedIds : unlockedAchievementIds;
    
    try {
      setEntriesLoading(true);
      const userEntries = await getEntriesFast(user.uid, INITIAL_ENTRIES_LIMIT);

      // Delay heavy media processing and only process initially visible items.
      InteractionManager.runAfterInteractions(() => {
        void resolveVideoThumbnailsInBackground(userEntries.slice(0, INITIAL_MEDIA_RESOLVE_LIMIT));
      });

      // Näytä lista heti (älä odota saavutusten tallennuksia)
      setEntries(userEntries);
      setEntriesLoading(false);
      
      // Calculate new stats
      const newStats = calculateStats(userEntries);
      
      // Check for new achievements based on current stats
      // Use lastProcessedStats to avoid repeated achievements (not just empty object)
      const oldStats = lastProcessedStats.current || {
        totalEntries: 0,
        totalImages: 0,
        longestStreak: 0,
        currentStreak: 0,
        firstEntryDate: null,
        totalWords: 0,
        maxEntriesPerDay: 0,
        sharedCount: 0,
        entriesWithLocation: 0,
        earlyBirdCount: 0,
        nightOwlCount: 0,
        weekendCount: 0,
        maxImagesInEntry: 0,
      };
      
      const allStatsAchievements = checkNewAchievements(oldStats, newStats);
      
      // Sync all achievements that are new according to stats but missing from AsyncStorage.
      // Rely on the loaded ID list passed into this call instead of a possibly stale state flag.
      const achievementsToSync = allStatsAchievements.filter(
        (achievement) => !previouslyUnlockedIds.includes(achievement.id)
      );
      
      if (achievementsToSync.length > 0 && user) {
        // Tallenna saavutukset rinnakkain taustalla (ei blokata renderöintiä)
        void Promise.all(
          achievementsToSync.map((achievement) => addUnlockedAchievement(user.uid, achievement.id))
        ).catch((error) => {
        });

        // Update local state without duplicating ids across repeated refresh cycles.
        setUnlockedAchievementIds((prev) => {
          const nextIds = achievementsToSync.map((achievement) => achievement.id);
          return Array.from(new Set([...prev, ...nextIds]));
        });

        // Avoid showing legacy achievements on initial login hydration.
        if (achievementBaselineHydratedRef.current) {
          // Show toast for the first new achievement
          setAchievementToast(achievementsToSync[0]);
          setShowToast(true);

          // If there are multiple achievements, show them one by one
          if (achievementsToSync.length > 1) {
            for (let i = 1; i < Math.min(3, achievementsToSync.length); i++) {
              setTimeout(() => {
                setAchievementToast(achievementsToSync[i]);
                setShowToast(true);
              }, i * 5500); // 5.5 second delay between each toast
            }
          }
        }
      }
      
      // Always update the ref to current stats, so next load won't show achievements again
      lastProcessedStats.current = newStats;
      achievementBaselineHydratedRef.current = true;
      setStats(newStats);

      // Puretaan kuvat taustalla (ei blokata ensimmäistä renderiä)
      resolveEntryImagesInBackground(userEntries.slice(0, INITIAL_MEDIA_RESOLVE_LIMIT))
        .then((resolvedEntriesSubset) => {
          setEntries((prevEntries) => {
            if (!prevEntries.length) {
              return prevEntries;
            }

            const resolvedMap = new Map(resolvedEntriesSubset.map((entry) => [entry.id, entry]));
            let changed = false;

            const merged = prevEntries.map((entry) => {
              const resolved = resolvedMap.get(entry.id);
              if (!resolved) {
                return entry;
              }

              if (resolved.images === entry.images) {
                return entry;
              }

              changed = true;
              return {
                ...entry,
                images: resolved.images,
              };
            });

            return changed ? merged : prevEntries;
          });
        })
        .catch((error) => {
        });
    } catch (error) {
      setEntries([]);
      setEntriesLoading(false);
    } finally {
      entriesLoadInFlightRef.current = false;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const ids = await loadUnlockedAchievements();
    await loadEntries(ids);
    await maybeShowTodayReminders({ ignoreLastShown: true });
    setRefreshing(false);
  };

  const maybeShowTodayReminders = async (options?: { ignoreLastShown?: boolean }) => {
    const showEnabled = await getShowTodayRemindersAlert();
    if (!showEnabled) {
      return;
    }

    const todayKey = getTodayDateKey();
    const lastShown = await getLastReminderAlertDate();

    if (!options?.ignoreLastShown && lastShown === todayKey) {
      return;
    }

    const summary = await getTodayRemindersSummary(locale);

    if (!summary) {
      return;
    }

    setReminderToastMessage(summary.message);
    setShowReminderToast(true);
    await setLastReminderAlertDate(summary.dateKey);
  };

  const getAchievementProgress = (achievement: Achievement) => {
    let current = 0;

    switch (achievement.type) {
      case 'streak':
        current = stats.currentStreak;
        break;
      case 'entries':
        current = stats.totalEntries;
        break;
      case 'images':
        current = stats.totalImages;
        break;
      case 'words':
        current = stats.totalWords;
        break;
      case 'multiDay':
        current = stats.maxEntriesPerDay;
        break;
      case 'shared':
        current = stats.sharedCount;
        break;
      case 'location':
        current = stats.entriesWithLocation;
        break;
      case 'earlyBird':
        current = stats.earlyBirdCount;
        break;
      case 'nightOwl':
        current = stats.nightOwlCount;
        break;
      case 'weekend':
        current = stats.weekendCount;
        break;
      case 'photoCollection':
        current = stats.maxImagesInEntry;
        break;
    }

    const target = achievement.requirement;
    const progress = Math.min((current / target) * 100, 100);

    return { current, target, progress };
  };

  const unlockedAchievementIdsFromStats = useMemo(() => {
    return getUnlockedAchievements(stats).map((achievement) => achievement.id);
  }, [stats]);

  const effectiveUnlockedAchievementIds = useMemo(() => {
    return Array.from(new Set([...unlockedAchievementIds, ...unlockedAchievementIdsFromStats]));
  }, [unlockedAchievementIds, unlockedAchievementIdsFromStats]);

  useEffect(() => {
    if (!user || !achievementsLoaded) {
      return;
    }

    const missingIds = unlockedAchievementIdsFromStats.filter(
      (id) => !unlockedAchievementIds.includes(id)
    );

    if (missingIds.length === 0) {
      return;
    }

    // Keep persisted achievement state aligned with current stats-derived unlocks.
    void Promise.all(missingIds.map((id) => addUnlockedAchievement(user.uid, id))).catch(() => undefined);
    setUnlockedAchievementIds((prev) => Array.from(new Set([...prev, ...missingIds])));
  }, [achievementsLoaded, unlockedAchievementIds, unlockedAchievementIdsFromStats, user]);

  const pendingAchievements = useMemo(() => {
    return achievements
      .filter((achievement) => !effectiveUnlockedAchievementIds.includes(achievement.id))
      .map((achievement) => {
        const localized = getLocalizedAchievement(achievement, language);
        const progressInfo = getAchievementProgress(achievement);
        const priority = progressInfo.target > 0 ? progressInfo.current / progressInfo.target : 0;

        return {
          achievement: localized,
          progressInfo,
          priority,
        };
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.progressInfo.target - b.progressInfo.target;
      });
  }, [effectiveUnlockedAchievementIds, language, stats]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return t('timeline_just_now');
    if (hours < 24) return t('timeline_hours_ago', { hours });
    if (days === 1) return t('timeline_yesterday');
    if (days < 7) return t('timeline_days_ago', { days });
    return formatDate(date);
  };

  const resolveVideoThumbnailsInBackground = async (entriesToResolve: DiaryEntry[]) => {
    const entriesWithVideos = entriesToResolve.filter((entry) => entry.videos && entry.videos.length > 0);

    const results = await Promise.allSettled(
      entriesWithVideos.map(async (entry) => {
        const firstVideoUri = entry.videos?.[0];
        if (!firstVideoUri) {
          return null;
        }

        // Prefer already uploaded thumbnail URL first to avoid expensive local generation.
        const storedThumbnailUri = entry.videoThumbnails?.[firstVideoUri];
        if (storedThumbnailUri) {
          return { entryId: entry.id, thumbnailUri: storedThumbnailUri };
        }

        try {
          const cachedThumbnailUri = await ensureVideoThumbnailCached(firstVideoUri);
          if (cachedThumbnailUri) {
            return { entryId: entry.id, thumbnailUri: cachedThumbnailUri };
          }
        } catch {
        }

        return null;
      })
    );

    setVideoThumbnailMap((prev) => {
      let changed = false;
      const next = { ...prev };

      results.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value) {
          return;
        }

        const { entryId, thumbnailUri } = result.value;
        if (!thumbnailUri || next[entryId] === thumbnailUri) {
          return;
        }

        next[entryId] = thumbnailUri;
        changed = true;
      });

      return changed ? next : prev;
    });
  };

  const renderImages = (images: string[], layout: LayoutType = 'grid', title?: string, content?: string) => {
    if (images.length === 0) return null;

    // Pienennä kokoja timelinelle
    const cardWidth = width - spacing.lg * 2;

    switch (layout) {
      case 'grid':
        return (
          <View style={styles.timelineGridContainer}>
            {images.slice(0, 4).map((uri, index) => (
              <View key={index} style={styles.timelineGridImageWrapper}>
                <Image source={{ uri }} style={styles.timelineGridImage} resizeMode="cover" />
                {images.length > 4 && index === 3 && (
                  <View style={styles.moreImagesOverlay}>
                    <Text style={styles.moreImagesText}>+{images.length - 4}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        );

      case 'masonry':
        const heights = [120, 160, 130, 170, 125, 145];
        return (
          <View style={styles.timelineMasonryContainer}>
            <View style={styles.timelineMasonryColumn}>
              {images.slice(0, 3).filter((_, i) => i % 2 === 0).map((uri, index) => {
                const actualIndex = index * 2;
                const height = heights[actualIndex % heights.length];
                return (
                  <View key={actualIndex} style={[styles.timelineMasonryImageWrapper, { height }]}>
                    <Image source={{ uri }} style={styles.timelineMasonryImage} resizeMode="cover" />
                  </View>
                );
              })}
            </View>
            <View style={styles.timelineMasonryColumn}>
              {images.slice(0, 3).filter((_, i) => i % 2 === 1).map((uri, index) => {
                const actualIndex = index * 2 + 1;
                const height = heights[actualIndex % heights.length];
                return (
                  <View key={actualIndex} style={[styles.timelineMasonryImageWrapper, { height }]}>
                    <Image source={{ uri }} style={styles.timelineMasonryImage} resizeMode="cover" />
                  </View>
                );
              })}
            </View>
          </View>
        );

      case 'magazine':
        return (
          <View style={styles.timelineMagazineContainer}>
            {images[0] && (
              <View style={styles.timelineMagazineLargeWrapper}>
                <Image source={{ uri: images[0] }} style={styles.timelineMagazineLarge} resizeMode="cover" />
              </View>
            )}
            {images.length > 1 && (
              <View style={styles.timelineMagazineSmallRow}>
                {images.slice(1, 4).map((uri, index) => (
                  <View key={index + 1} style={styles.timelineMagazineSmallWrapper}>
                    <Image source={{ uri }} style={styles.timelineMagazineSmall} resizeMode="cover" />
                  </View>
                ))}
              </View>
            )}
          </View>
        );

      case 'framed':
        return (
          <View style={styles.timelineFramedContainer}>
            {images.slice(0, 2).map((uri, index) => (
              <View key={index} style={styles.timelineFramedImageWrapper}>
                <View style={styles.timelineWoodFrame}>
                  <Image source={{ uri }} style={styles.timelineFramedImage} resizeMode="cover" />
                </View>
              </View>
            ))}
          </View>
        );

      case 'overlay':
        return (
          <View style={styles.timelineOverlayContainer}>
            {images[0] && (
              <View style={styles.timelineOverlayWrapper}>
                <Image source={{ uri: images[0] }} style={styles.timelineOverlayImage} resizeMode="cover" />
                
                {/* Text overlay like in EntryDetailScreen */}
                <View style={styles.timelineOverlayTextContainer}>
                  {title && <Text style={styles.timelineOverlayTitle} numberOfLines={2}>{title}</Text>}
                  {content && <Text style={styles.timelineOverlayContent} numberOfLines={3}>{content}</Text>}
                </View>
              </View>
            )}
          </View>
        );

      case 'full':
      default:
        return (
          <View style={styles.timelineFullContainer}>
            {images.slice(0, 2).map((uri, index) => (
              <View key={index} style={styles.timelineFullImageWrapper}>
                <Image source={{ uri }} style={styles.timelineFullImage} resizeMode="cover" />
              </View>
            ))}
          </View>
        );
    }
  };

  const renderEntry = ({ item }: { item: DiaryEntry }) => {
    const renderVideoPreview = () => {
      if (!item.videos || item.videos.length === 0) return null;

      const firstVideoUri = item.videos[0];
      const storedThumbnailUri = firstVideoUri ? item.videoThumbnails?.[firstVideoUri] : undefined;
      const generatedThumbnailUri = videoThumbnailMap[item.id];
      const thumbnailUri = storedThumbnailUri || generatedThumbnailUri;

      return (
        <View style={styles.timelineVideoPreviewContainer}>
          <View style={styles.timelineVideoPreviewCard}>
            {thumbnailUri ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={styles.timelineVideoPreviewPlayer}
                resizeMode="cover"
                fadeDuration={0}
              />
            ) : (
              <View style={[styles.timelineVideoPlaceholder, styles.timelineVideoLayer]}>
                <Text style={styles.timelineVideoPlaceholderIcon}>🎥</Text>
              </View>
            )}

            <View style={styles.timelineVideoBadge}>
              <Text style={styles.timelineVideoBadgeText}>{t('timeline_video_badge')}</Text>
            </View>

            {item.videos.length > 1 && (
              <View style={styles.timelineVideoCountBadge}>
                <Text style={styles.timelineVideoCountText}>+{item.videos.length - 1}</Text>
              </View>
            )}
          </View>
        </View>
      );
    };

    // Text Overlay Mode
    if (item.textOverlay && item.images.length > 0) {
      return (
        <View style={[styles.entryCard, { backgroundColor: theme.colors.background }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              navigation.navigate('EntryDetail', {
                entry: {
                  ...item,
                  date: item.date instanceof Date ? item.date.toISOString() : item.date,
                  createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
                  updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
                },
              });
            }}
          >
            <View style={styles.overlayCard}>
              {/* Background Image */}
              <Image 
                source={{ uri: item.images[0] }} 
                style={styles.overlayBackground}
                blurRadius={1}
              />
              
              {/* Dark overlay */}
              <View style={styles.overlayDark} />
              
              {/* Content on top */}
              <View style={styles.overlayContent}>
                <View style={styles.entryHeader}>
                  <View style={styles.dateContainer}>
                    <Text style={[styles.dayNumber, { color: theme.colors.text }]}>
                      {new Date(item.date).getDate()}
                    </Text>
                    <Text style={[styles.monthText, { color: theme.colors.text }]}>
                      {new Date(item.date).toLocaleDateString(locale, { month: 'short' })}
                    </Text>
                  </View>
                  
                  <View style={styles.entryHeaderContent}>
                    <Text style={[styles.entryTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.entryTime, { color: theme.colors.textSecondary }]}>
                      {getTimeAgo(item.date)}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.entryContent, { color: theme.colors.text }]} numberOfLines={3}>
                  {item.content}
                </Text>

                {renderVideoPreview()}

                <View style={styles.entryFooter}>
                  {item.location && (
                    <View style={styles.locationContainer}>
                      <Text style={styles.locationIcon}>📍</Text>
                      <Text style={[styles.locationText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {item.location.address || `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}`}
                      </Text>
                    </View>
                  )}
                  <View style={styles.entryStats}>
                    {item.images.length > 0 && (
                      <View style={styles.stat}>
                        <Text style={styles.statIcon}>📷</Text>
                        <Text style={[styles.statText, { color: theme.colors.text }]}>{item.images.length}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // Overlay Mode - show only image with text overlay, no separate title/content
    if (item.layout === 'overlay' && item.images.length > 0) {
      return (
        <TouchableOpacity
          style={[styles.entryCard, { backgroundColor: theme.colors.background }]}
          activeOpacity={0.7}
          onPress={() => {
            navigation.navigate('EntryDetail', {
              entry: {
                ...item,
                date: item.date instanceof Date ? item.date.toISOString() : item.date,
                createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
                updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
              },
            });
          }}
        >
          {/* Only render images with overlay - no separate title/content */}
          {renderImages(item.images, item.layout, item.title, item.content)}

          {renderVideoPreview()}

          {/* Entry Footer */}
          <View style={styles.entryFooter}>
            {item.location && (
              <View style={styles.locationContainer}>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  {item.location.address || `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}`}
                </Text>
              </View>
            )}
            <View style={styles.entryStats}>
              {item.images.length > 0 && (
                <View style={styles.stat}>
                  <Text style={styles.statIcon}>📷</Text>
                  <Text style={styles.statText}>{item.images.length}</Text>
                </View>
              )}
              {item.videos && item.videos.length > 0 && (
                <View style={styles.stat}>
                  <Text style={styles.statIcon}>🎥</Text>
                  <Text style={styles.statText}>{item.videos.length}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Normal Mode
    return (
    <View style={[styles.entryCard, { backgroundColor: theme.colors.background }]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          navigation.navigate('EntryDetail', {
            entry: {
              ...item,
              date: item.date instanceof Date ? item.date.toISOString() : item.date,
              createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
              updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
            },
          });
        }}
      >
        {/* Entry Header */}
        <View style={styles.entryHeader}>
          <View style={styles.dateContainer}>
            <Text style={styles.dayNumber}>
              {new Date(item.date).getDate()}
            </Text>
            <Text style={styles.monthText}>
              {new Date(item.date).toLocaleDateString(locale, { month: 'short' })}
            </Text>
          </View>
          
          <View style={styles.entryHeaderContent}>
            <Text style={styles.entryTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.entryTime}>
              {getTimeAgo(item.date)}
            </Text>
          </View>
        </View>

        {/* Entry Content */}
        <Text style={styles.entryContent} numberOfLines={3}>
          {item.content}
        </Text>

        {/* Images with layout */}
        {item.images.length > 0 && renderImages(item.images, item.layout || 'grid', item.title, item.content)}

        {renderVideoPreview()}

        {/* Entry Footer */}
        <View style={styles.entryFooter}>
          {item.location && (
            <View style={styles.locationContainer}>
              <Text style={styles.locationIcon}>📍</Text>
              <Text style={styles.locationText} numberOfLines={1}>
                {item.location.address || `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}
          <View style={styles.entryStats}>
            {item.images.length > 0 && (
              <View style={styles.stat}>
                <Text style={styles.statIcon}>📷</Text>
                <Text style={styles.statText}>{item.images.length}</Text>
              </View>
            )}
            {item.videos && item.videos.length > 0 && (
              <View style={styles.stat}>
                <Text style={styles.statIcon}>🎥</Text>
                <Text style={styles.statText}>{item.videos.length}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

  return (
    <View style={[styles.container, themed.screenBg]}>
      {/* Achievement Toast */}
      <AchievementToast
        achievement={achievementToast}
        visible={showToast}
        onHide={() => {
          setShowToast(false);
          setAchievementToast(null);
        }}
      />

      <ReminderToast
        title={t('timeline_reminders_today')}
        message={reminderToastMessage}
        visible={showReminderToast}
        onHide={() => setShowReminderToast(false)}
      />

      {/* Header */}
      <View style={[styles.header, themed.headerBg]}>
        <View style={styles.headerTop}>
          <Text
            style={[styles.headerTitle, themed.headingText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {t('timeline_header')}
          </Text>

          <View style={styles.headerActions}>
            {/* Search Icon */}
            <TouchableOpacity
              style={[styles.searchIconButton, themed.chipBg]}
              onPress={() => {
                setShowSearch(!showSearch);
                if (showSearch) {
                  setSearchQuery('');
                }
              }}
            >
              <Text style={styles.searchIconText}>🔍</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reminderButton, themed.chipBg]}
              onPress={() => navigation.navigate('Reminders')}
            >
              <Text style={styles.reminderIconText}>⏰</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileButton, themed.chipBg]}
              onPress={() => navigation.navigate('Profile')}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <Text style={styles.profileIcon}>👤</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showGreetingCard && (
          <Animated.View
            style={[
              styles.dailyGreetingCard,
              {
                backgroundColor: theme.colors.backgroundLight,
                borderColor: theme.colors.border,
                opacity: greetingAnim,
                transform: [
                  {
                    translateY: greetingAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                  {
                    scale: greetingAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={[styles.dailyGreetingText, greetingStyleVariant]}>{dailyGreetingText}</Text>
          </Animated.View>
        )}
        
        {/* Search Input - Toggleable */}
        {showSearch && (
          <View style={[styles.searchInputContainer, themed.searchBg, themed.searchBorder]}>
            <TextInput
              style={[styles.searchInputField, themed.searchText]}
              placeholder={t('timeline_search_placeholder')}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Achievements Section */}
      <View style={styles.achievementsContainer}>
        <View style={styles.achievementsRowHeader}>
          <Text style={[styles.achievementsRowTitle, themed.primaryText]}>{t('timeline_goals_next')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Achievements')}>
            <Text style={[styles.achievementsRowAction, themed.linkText]}>{t('timeline_show_all')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.achievementsScroll}
          style={styles.achievementsPendingScroll}
        >
          {pendingAchievements.map(({ achievement, progressInfo }) => (
            <TouchableOpacity
              key={achievement.id}
              style={[styles.achievementCard, styles.achievementCardLocked, themed.cardBg]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Achievements')}
            >
              <Text style={[styles.achievementCardIcon, styles.achievementCardIconLocked]}>
                {achievement.icon}
              </Text>
              <Text
                style={[styles.achievementCardTitle, styles.achievementCardTitleLocked, themed.cardTitle]}
                numberOfLines={2}
              >
                {achievement.name}
              </Text>
              <View style={styles.progressBarContainerCompact}>
                <View
                  style={[
                    styles.progressBarCompact,
                    { width: `${progressInfo.progress}%` },
                    styles.progressBarCompactLocked,
                    themed.progress,
                  ]}
                />
              </View>
              <Text style={[styles.achievementCardProgress, styles.achievementCardProgressLocked, themed.secondaryText]}>
                {Math.min(progressInfo.current, progressInfo.target)} / {progressInfo.target}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

      </View>

      {/* Entries List */}
      <FlatList
        data={filteredEntries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        extraData={videoThumbnailMap}
        removeClippedSubviews={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          entriesLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={[styles.loadingEntriesText, themed.secondaryText]}>{t('timeline_loading')}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>{searchQuery.trim() ? '🔍' : '📖'}</Text>
              </View>
              <Text style={[styles.emptyTitle, themed.primaryText]}>
                {searchQuery.trim()
                  ? t('timeline_no_results_for', { query: searchQuery })
                  : t('timeline_empty_title')}
              </Text>
              <Text style={[styles.emptySubtitle, themed.secondaryText]}>
                {searchQuery.trim()
                  ? t('timeline_no_results_sub')
                  : t('timeline_empty_subtitle')}
              </Text>
              {!searchQuery.trim() && (
                <TouchableOpacity
                  style={[styles.emptyButton, themed.emptyButtonBg]}
                  onPress={() => navigation.navigate('NewEntry', { clearForm: true })}
                >
                  <Text style={styles.emptyButtonText}>{t('timeline_create_first')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
      />

      {/* Floating Action Button */}
      {entries.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, themed.fabBg]}
          onPress={() => navigation.navigate('NewEntry', { clearForm: true })}
          activeOpacity={0.8}
        >
          <Text style={styles.fabIcon}>✏️</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  header: {
    backgroundColor: colors.white,
    paddingTop: 60,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...commonStyles.heading1,
    marginBottom: 0,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  headerSubtitle: {
    ...commonStyles.bodySecondary,
  },
  dailyGreetingCard: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  dailyGreetingText: {
    fontSize: typography.fontSizes.lg,
    lineHeight: 28,
    fontWeight: typography.fontWeights.semibold,
  },
  searchIconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  reminderButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  reminderIconText: {
    fontSize: 20,
  },
  searchIconText: {
    fontSize: 20,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  searchInputField: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearButtonText: {
    fontSize: 24,
    color: colors.textSecondary,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profileIcon: {
    fontSize: 24,
  },
  achievementsContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  achievementsRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  achievementsRowTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  achievementsRowAction: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  achievementsPendingScroll: {
    minHeight: 122,
  },
  achievementsScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  achievementCard: {
    width: 118,
    height: 100,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  achievementCardLocked: {
    backgroundColor: colors.gray50,
    borderColor: colors.gray200,
  },
  achievementCardIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  achievementCardIconLocked: {
    opacity: 0.5,
  },
  achievementCardValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.primary,
  },
  achievementCardLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  achievementCardTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  achievementCardTitleLocked: {
    color: colors.textSecondary,
  },
  progressBarContainerCompact: {
    width: '100%',
    height: 4,
    backgroundColor: colors.gray200,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginVertical: spacing.xs,
  },
  progressBarCompact: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  progressBarCompactLocked: {
    backgroundColor: colors.gray400,
  },
  achievementCardProgress: {
    fontSize: typography.fontSizes.xs - 1,
    color: colors.textSecondary,
  },
  achievementCardProgressLocked: {
    color: colors.textSecondary,
  },
  achievementUnlockedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementUnlockedText: {
    color: colors.white,
    fontSize: typography.fontSizes.xs - 2,
    fontWeight: typography.fontWeights.bold,
  },
  listContent: {
    padding: spacing.md,
  },
  entryCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  overlayCard: {
    position: 'relative',
    minHeight: 250,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  overlayBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  overlayDark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayContent: {
    position: 'relative',
    zIndex: 1,
    padding: spacing.lg,
  },
  entryHeader: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  dateContainer: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  dayNumber: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    lineHeight: typography.fontSizes.xxl,
  },
  monthText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.white,
    textTransform: 'uppercase',
  },
  entryHeaderContent: {
    flex: 1,
    justifyContent: 'center',
  },
  entryTitle: {
    ...commonStyles.heading3,
    marginBottom: spacing.xs,
  },
  entryTime: {
    ...commonStyles.caption,
  },
  entryContent: {
    ...commonStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  imageWrapper: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.sm,
  },
  circleImageWrapper: {
    borderRadius: borderRadius.full,
  },
  landscapeImageWrapper: {
    aspectRatio: 16 / 9,
  },
  singleImage: {
    width: '100%',
    height: 200,
  },
  multiImage: {
    width: '48.5%',
    height: 150,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  moreImagesOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreImagesText: {
    color: colors.white,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIcon: {
    fontSize: typography.fontSizes.md,
    marginRight: spacing.xs,
  },
  locationText: {
    ...commonStyles.caption,
    flex: 1,
  },
  entryStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statIcon: {
    fontSize: typography.fontSizes.sm,
  },
  statText: {
    ...commonStyles.caption,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 60,
  },
  emptyTitle: {
    ...commonStyles.heading2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...commonStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    ...shadows.lg,
  },
  emptyButtonText: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  loadingEntriesText: {
    ...commonStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.xl,
  },
  fabIcon: {
    fontSize: 28,
  },

  // Timeline Layout Styles
  timelineGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  timelineGridImageWrapper: {
    position: 'relative',
    width: '48.8%',
    height: 120,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  timelineGridImage: {
    width: '100%',
    height: '100%',
  },

  timelineMasonryContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timelineMasonryColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  timelineMasonryImageWrapper: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  timelineMasonryImage: {
    width: '100%',
    height: '100%',
  },

  timelineMagazineContainer: {
    marginBottom: spacing.md,
  },
  timelineMagazineLargeWrapper: {
    height: 200,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  timelineMagazineLarge: {
    width: '100%',
    height: '100%',
  },
  timelineMagazineSmallRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  timelineMagazineSmallWrapper: {
    flex: 1,
    height: 80,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  timelineMagazineSmall: {
    width: '100%',
    height: '100%',
  },

  timelineFullContainer: {
    marginBottom: spacing.md,
  },
  timelineFullImageWrapper: {
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  timelineFullImage: {
    width: '100%',
    height: 180,
  },

  timelineFramedContainer: {
    marginBottom: spacing.md,
  },
  timelineFramedImageWrapper: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  timelineWoodFrame: {
    padding: 10,
    backgroundColor: '#8B4513',
    borderRadius: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#654321',
  },
  timelineFramedImage: {
    width: width - spacing.lg * 3 - 20,
    height: 200,
    borderWidth: 1,
    borderColor: '#DEB887',
  },

  // Overlay Layout
  timelineOverlayContainer: {
    marginBottom: spacing.md,
  },
  timelineOverlayWrapper: {
    position: 'relative',
    height: 250,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  timelineOverlayImage: {
    width: '100%',
    height: '100%',
  },
  timelineOverlayGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  timelineOverlayTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  timelineOverlayTitle: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timelineOverlayContent: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    lineHeight: typography.fontSizes.md * 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timelineOverlayBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  timelineOverlayBadgeText: {
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },

  timelineVideoPreviewContainer: {
    marginBottom: spacing.md,
  },
  timelineVideoPreviewCard: {
    height: 190,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
    position: 'relative',
  },
  timelineVideoPreviewPlayer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  timelineVideoLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  timelineVideoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray100,
  },
  timelineVideoPlaceholderIcon: {
    fontSize: 38,
  },
  timelineVideoBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  timelineVideoBadgeText: {
    color: colors.white,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  timelineVideoCountBadge: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  timelineVideoCountText: {
    color: colors.white,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
});
