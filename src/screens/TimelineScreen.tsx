import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  TextInput,
  Dimensions,
  InteractionManager,
  Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DiaryEntry } from '../types/DiaryEntry';
import { useAuth } from '../contexts/AuthContext';
import {
  getEntriesFast,
  getUserProfile,
  getCachedVideoThumbnailUri,
  ensureVideoThumbnailCached,
  resolveEntryImagesInBackground,
  resolveVideoUriForPlayback,
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
import * as VideoThumbnails from 'expo-video-thumbnails';
import {
  achievements,
  calculateStats,
  checkNewAchievements,
  Achievement,
  Stats,
} from '../utils/achievementUtils';

const { width } = Dimensions.get('window');
type LayoutType = 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';

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
    multiDayCount: 0,
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
  const [visibleEntryIds, setVisibleEntryIds] = useState<Set<string>>(new Set());
  const [videoThumbnailMap, setVideoThumbnailMap] = useState<Record<string, string>>({});
  const { user } = useAuth();
  
  // Muista viimeiset tilastot joista näytettiin toast
  const lastProcessedStats = useRef<Stats | null>(null);
  const entriesLoadInFlightRef = useRef(false);
  const thumbnailBackfillQueueRef = useRef<Array<{ entryId: string; videoUrl: string }>>([]);
  const thumbnailBackfillInFlightRef = useRef(false);
  const thumbnailBackfillSeenRef = useRef<Set<string>>(new Set());
  const videoThumbnailFadeMapRef = useRef<Record<string, Animated.Value>>({});

  const getVideoThumbnailFadeValue = (entryId: string): Animated.Value => {
    if (!videoThumbnailFadeMapRef.current[entryId]) {
      videoThumbnailFadeMapRef.current[entryId] = new Animated.Value(0);
    }
    return videoThumbnailFadeMapRef.current[entryId];
  };

  const resetVideoThumbnailFade = (entryId: string) => {
    getVideoThumbnailFadeValue(entryId).setValue(0);
  };

  const animateVideoThumbnailFadeIn = (entryId: string) => {
    Animated.timing(getVideoThumbnailFadeValue(entryId), {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const processThumbnailBackfillQueue = async () => {
    if (thumbnailBackfillInFlightRef.current) {
      return;
    }

    thumbnailBackfillInFlightRef.current = true;
    try {
      while (thumbnailBackfillQueueRef.current.length > 0) {
        const next = thumbnailBackfillQueueRef.current.shift();
        if (!next) continue;

        // Wait until UI interactions settle to avoid jank while scrolling.
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });

        await new Promise((resolve) => setTimeout(resolve, 250));

        const thumbnailUri = await ensureVideoThumbnailCached(next.videoUrl);
        if (thumbnailUri) {
          resetVideoThumbnailFade(next.entryId);
          setVideoThumbnailMap((prev) => ({ ...prev, [next.entryId]: thumbnailUri }));
          console.log(`✅ [thumbnailBackfill] Cached thumbnail ready for ${next.entryId}`);
        } else {
          console.log(`⚠️ [thumbnailBackfill] Could not build thumbnail for ${next.entryId}`);
        }
      }
    } finally {
      thumbnailBackfillInFlightRef.current = false;
    }
  };

  const enqueueThumbnailBackfill = (entryId: string, videoUrl: string) => {
    const queueKey = `${entryId}:${videoUrl}`;
    if (thumbnailBackfillSeenRef.current.has(queueKey)) {
      return;
    }

    thumbnailBackfillSeenRef.current.add(queueKey);
    thumbnailBackfillQueueRef.current.push({ entryId, videoUrl });
    void processThumbnailBackfillQueue();
  };

  // Suodata merkinnät hakutermin perusteella
  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const titleMatch = entry.title.toLowerCase().includes(query);
    const contentMatch = entry.content.toLowerCase().includes(query);
    const locationMatch = entry.location?.address?.toLowerCase().includes(query) || false;
    
    return titleMatch || contentMatch || locationMatch;
  });

  // Ladataan entryt uudelleen kun palataan tähän screeniin
  useFocusEffect(
    React.useCallback(() => {
      console.log('🎯 [TimelineScreen] useFocusEffect triggered, user:', user?.uid);
      if (user) {
        // Lataa saavutukset ensin, sitten entries
        console.log('🎯 [TimelineScreen] Starting achievement load...');
        loadUnlockedAchievements().then((ids) => {
          console.log(`🎯 [TimelineScreen] Loaded ${ids.length} unlocked achievements:`, ids);
          console.log('🎯 [TimelineScreen] Starting entries load...');
          loadEntries(ids).then(() => {
            console.log('🎯 [TimelineScreen] Entries loaded, checking for reminders...');
            maybeShowTodayReminders({ ignoreLastShown: true });
          });
        });
        console.log('🎯 [TimelineScreen] Starting profile load...');
        loadUserProfile();
      }
    }, [user])
  );

  const loadUnlockedAchievements = async (): Promise<number[]> => {
    console.log('📊 [loadUnlockedAchievements] Starting...');
    if (!user) return [];
    
    try {
      const ids = await getUnlockedAchievementIds(user.uid);
      console.log(`📊 [loadUnlockedAchievements] Got ${ids.length} achievements:`, ids);
      setUnlockedAchievementIds(ids);
      return ids;
    } catch (error) {
      console.error('❌ [loadUnlockedAchievements] Error:', error);
      return [];
    }
  };

  const loadUserProfile = async () => {
    console.log('👤 [loadUserProfile] Starting...');
    if (!user) return;

    try {
      const profile = await getUserProfile(user.uid);
      console.log('👤 [loadUserProfile] Got profile:', profile?.displayName);
      if (profile?.photoURL) {
        setProfileImage(profile.photoURL);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadEntries = async (unlockedIds?: number[]) => {
    if (!user) return;

    // Estä päällekkäiset lataukset (esim. focus + strict mode -tuplakutsu)
    if (entriesLoadInFlightRef.current) {
      console.log('⚠️ [loadEntries] Load already in flight, skipping');
      return;
    }
    entriesLoadInFlightRef.current = true;
    console.log('📚 [loadEntries] Starting entry load...');
    
    // Use provided IDs or fall back to state (for refresh scenarios)
    const previouslyUnlockedIds = unlockedIds !== undefined ? unlockedIds : unlockedAchievementIds;
    console.log(`📚 [loadEntries] Previously unlocked achievements: ${previouslyUnlockedIds.length}`);
    
    try {
      setEntriesLoading(true);
      const userEntries = await getEntriesFast(user.uid, 10);
      console.log(`📚 [loadEntries] Got ${userEntries.length} entries from Firebase`);

      // Näytä lista heti (älä odota saavutusten tallennuksia)
      setEntries(userEntries);
      setEntriesLoading(false);
      console.log('📚 [loadEntries] UI updated with entries');
      
      // Calculate new stats
      const newStats = calculateStats(userEntries);
      console.log(`📊 [loadEntries] New stats: ${newStats.totalEntries} entries, ${newStats.currentStreak} day streak, ${newStats.totalImages} images`);
      
      // Check for new achievements based on current stats
      // Use lastProcessedStats to avoid repeated achievements (not just empty object)
      const oldStats = lastProcessedStats.current || {
        totalEntries: 0,
        totalImages: 0,
        longestStreak: 0,
        currentStreak: 0,
        firstEntryDate: null,
        totalWords: 0,
        multiDayCount: 0,
        sharedCount: 0,
        entriesWithLocation: 0,
        earlyBirdCount: 0,
        nightOwlCount: 0,
        weekendCount: 0,
        maxImagesInEntry: 0,
      };
      
      const allStatsAchievements = checkNewAchievements(oldStats, newStats);
      console.log(`🏆 [loadEntries] Achievement check: found ${allStatsAchievements.length} NEW achievements (old vs new stats)`);
      
      // Sync all achievements that are new according to stats but missing from AsyncStorage
      const achievementsToSync = allStatsAchievements.filter(
        achievement => !previouslyUnlockedIds.includes(achievement.id)
      );
      console.log(`🏆 [loadEntries] Achievements to sync+toast: ${achievementsToSync.length}`, achievementsToSync.map(a => a.name));
      
      if (achievementsToSync.length > 0 && user) {
        console.log(`🏆 [loadEntries] Saving ${achievementsToSync.length} new achievements to AsyncStorage...`);
        // Tallenna saavutukset rinnakkain taustalla (ei blokata renderöintiä)
        void Promise.all(
          achievementsToSync.map((achievement) => addUnlockedAchievement(user.uid, achievement.id))
        ).catch((error) => {
          console.error('❌ [loadEntries] Error saving achievements:', error);
        });

        // Update local state
        setUnlockedAchievementIds((prev) => [...prev, ...achievementsToSync.map((a) => a.id)]);

        // Show toast for the first new achievement
        console.log(`🏆 [loadEntries] Showing achievement toast: ${achievementsToSync[0].name}`);
        setAchievementToast(achievementsToSync[0]);
        setShowToast(true);

        // If there are multiple achievements, show them one by one
        if (achievementsToSync.length > 1) {
          for (let i = 1; i < Math.min(3, achievementsToSync.length); i++) {
            setTimeout(() => {
              console.log(`🏆 [loadEntries] Showing achievement toast #${i + 1}: ${achievementsToSync[i].name}`);
              setAchievementToast(achievementsToSync[i]);
              setShowToast(true);
            }, i * 5500); // 5.5 second delay between each toast
          }
        }
      }
      
      // Always update the ref to current stats, so next load won't show achievements again
      lastProcessedStats.current = newStats;
      setStats(newStats);
      console.log('✅ [loadEntries] Stats updated');

      // Puretaan kuvat taustalla (ei blokata ensimmäistä renderiä)
      console.log('🖼️ [loadEntries] Starting background image resolve...');
      resolveEntryImagesInBackground(userEntries)
        .then((entriesWithImages) => {
          console.log('🖼️ [loadEntries] Images resolved');
          setEntries(entriesWithImages);

          console.log('🎬 [loadEntries] Starting background video thumbnail generation...');
          void resolveVideoThumbnailsInBackground(entriesWithImages);
        })
        .catch((error) => {
          console.error('❌ [loadEntries] Error resolving entry images in background:', error);
        });
    } catch (error) {
      console.error('❌ [loadEntries] Error loading entries:', error);
      setEntries([]);
      setEntriesLoading(false);
    } finally {
      console.log('✅ [loadEntries] Load complete');
      entriesLoadInFlightRef.current = false;
    }
  };

  const onRefresh = async () => {
    console.log('🔄 [onRefresh] User initiated refresh');
    setRefreshing(true);
    const ids = await loadUnlockedAchievements();
    await loadEntries(ids);
    await maybeShowTodayReminders({ ignoreLastShown: true });
    console.log('✅ [onRefresh] Complete');
    setRefreshing(false);
  };

  const maybeShowTodayReminders = async (options?: { ignoreLastShown?: boolean }) => {
    console.log('🔔 [maybeShowTodayReminders] Checking reminders...');
    const showEnabled = await getShowTodayRemindersAlert();
    if (!showEnabled) {
      console.log('🔔 [maybeShowTodayReminders] Reminders disabled');
      return;
    }

    const todayKey = getTodayDateKey();
    const lastShown = await getLastReminderAlertDate();
    console.log(`🔔 [maybeShowTodayReminders] Today: ${todayKey}, Last shown: ${lastShown}`);

    if (!options?.ignoreLastShown && lastShown === todayKey) {
      console.log('🔔 [maybeShowTodayReminders] Already shown today, skipping');
      return;
    }

    const summary = await getTodayRemindersSummary();

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
        current = stats.multiDayCount;
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fi-FI', {
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
    
    if (hours < 1) return 'Juuri nyt';
    if (hours < 24) return `${hours}h sitten`;
    if (days === 1) return 'Eilen';
    if (days < 7) return `${days} päivää sitten`;
    return formatDate(date);
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: DiaryEntry }> }) => {
    const ids = new Set(viewableItems.map((viewable) => viewable.item?.id).filter(Boolean));
    setVisibleEntryIds(ids as Set<string>);
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 35,
  }).current;

  const resolveVideoThumbnailsInBackground = async (entriesToResolve: DiaryEntry[]) => {
    // Generate thumbnails sequentially to avoid UI blocking
    // Skip first render - defer slightly to prevent UI freeze
    const entriesWithVideos = entriesToResolve.filter((e) => e.videos && e.videos.length > 0);
    console.log(`🎬 [resolveVideoThumbnailsInBackground] Starting thumbnail generation for ${entriesWithVideos.length} entries (deferring 1s)`);
    
    setTimeout(async () => {
      console.log(`🎬 [resolveVideoThumbnailsInBackground] Timer fired, starting sequential thumbnail generation...`);
      let successCount = 0;
      let failCount = 0;
      
      for (const entry of entriesToResolve) {
        try {
          if (!entry.videos || entry.videos.length === 0) continue;

          const firstVideoUri = entry.videos[0];
          if (!firstVideoUri) continue;

          const storedThumbnailUrl = entry.videoThumbnails?.[firstVideoUri];
          if (storedThumbnailUrl) {
            resetVideoThumbnailFade(entry.id);
            setVideoThumbnailMap((prev) => ({ ...prev, [entry.id]: storedThumbnailUrl }));
            successCount++;
            continue;
          }

          const cachedThumbnail = await getCachedVideoThumbnailUri(firstVideoUri);
          if (cachedThumbnail) {
            resetVideoThumbnailFade(entry.id);
            setVideoThumbnailMap((prev) => ({ ...prev, [entry.id]: cachedThumbnail }));
            successCount++;
            continue;
          }

          // Encrypted videos are handled in an idle backfill queue to avoid scroll jank.
          if (/\.enc(\?|$)/.test(firstVideoUri)) {
            enqueueThumbnailBackfill(entry.id, firstVideoUri);
            console.log(`🕒 [resolveVideoThumbnailsInBackground] Enqueued encrypted thumbnail backfill for ${entry.id}`);
            failCount++;
            continue;
          }

          // Small delay between each thumbnail generation
          await new Promise((resolve) => setTimeout(resolve, 100));

          console.log(`🎬 [resolveVideoThumbnailsInBackground] Getting thumbnail for entry ${entry.id}...`);
          const startTime = Date.now();
          
          try {
            const playableVideoUri = await resolveVideoUriForPlayback(firstVideoUri);
            console.log(`🎬 [resolveVideoThumbnailsInBackground] Resolved video URI for ${entry.id} in ${Date.now() - startTime}ms`);
            
            const thumbnailStart = Date.now();
            // Timeout: skip thumbnail if it takes longer than 15 seconds
            const thumbnailPromise = VideoThumbnails.getThumbnailAsync(playableVideoUri, {
              time: 0,
              quality: 0.6,
            });
            
            const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Thumbnail generation timeout')), 15000)
            );
            
            const thumbnailResult = await Promise.race([thumbnailPromise, timeoutPromise]);
            console.log(`🎬 [resolveVideoThumbnailsInBackground] Generated thumbnail for ${entry.id} in ${Date.now() - thumbnailStart}ms`);

            if (thumbnailResult?.uri) {
              console.log(`✅ [resolveVideoThumbnailsInBackground] Thumbnail generated for entry ${entry.id}`);
              successCount++;
              setVideoThumbnailMap((prev) => ({ ...prev, [entry.id]: thumbnailResult.uri }));
            } else {
              console.log(`⚠️ [resolveVideoThumbnailsInBackground] No thumbnail URI returned for ${entry.id}`);
              failCount++;
            }
          } catch (innerError) {
            console.log(`⚠️ [resolveVideoThumbnailsInBackground] Inner error for ${entry.id}:`, innerError);
            failCount++;
          }
        } catch (error) {
          // Thumbnail ei välttämättä synny kaikille vanhoille videoille.
          console.log(`⚠️ [resolveVideoThumbnailsInBackground] Thumbnail generation failed for entry ${entry.id}:`, error);
          failCount++;
        }
      }
      console.log(`✅ [resolveVideoThumbnailsInBackground] Complete: ${successCount} success, ${failCount} failed`);
    }, 1000); // Delay 1 second to not block initial render
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

      const shouldRenderVideo = visibleEntryIds.has(item.id);
      const thumbnailUri = videoThumbnailMap[item.id];
      const fadeValue = getVideoThumbnailFadeValue(item.id);

      return (
        <View style={styles.timelineVideoPreviewContainer}>
          <View style={styles.timelineVideoPreviewCard}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.timelineVideoPlaceholder,
                styles.timelineVideoLayer,
                {
                  opacity: fadeValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
                },
              ]}
            >
              <Text style={styles.timelineVideoPlaceholderIcon}>🎥</Text>
            </Animated.View>

            {shouldRenderVideo && thumbnailUri ? (
              <Animated.Image
                source={{ uri: thumbnailUri }}
                style={[styles.timelineVideoPreviewPlayer, { opacity: fadeValue }]}
                resizeMode="cover"
                fadeDuration={0}
                onLoadEnd={() => {
                  animateVideoThumbnailFadeIn(item.id);
                }}
              />
            ) : null}

            <View style={styles.timelineVideoBadge}>
              <Text style={styles.timelineVideoBadgeText}>Video</Text>
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
        <View style={styles.entryCard}>
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
                    <Text style={[styles.dayNumber, { color: colors.white }]}>
                      {new Date(item.date).getDate()}
                    </Text>
                    <Text style={[styles.monthText, { color: colors.white }]}>
                      {new Date(item.date).toLocaleDateString('fi-FI', { month: 'short' })}
                    </Text>
                  </View>
                  
                  <View style={styles.entryHeaderContent}>
                    <Text style={[styles.entryTitle, { color: colors.white }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.entryTime, { color: colors.white }]}>
                      {getTimeAgo(item.date)}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.entryContent, { color: colors.white }]} numberOfLines={3}>
                  {item.content}
                </Text>

                {renderVideoPreview()}

                <View style={styles.entryFooter}>
                  {item.location && (
                    <View style={styles.locationContainer}>
                      <Text style={styles.locationIcon}>📍</Text>
                      <Text style={[styles.locationText, { color: colors.white }]} numberOfLines={1}>
                        {item.location.address || `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}`}
                      </Text>
                    </View>
                  )}
                  <View style={styles.entryStats}>
                    {item.images.length > 0 && (
                      <View style={styles.stat}>
                        <Text style={styles.statIcon}>📷</Text>
                        <Text style={[styles.statText, { color: colors.white }]}>{item.images.length}</Text>
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
          style={styles.entryCard}
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
    <View style={styles.entryCard}>
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
              {new Date(item.date).toLocaleDateString('fi-FI', { month: 'short' })}
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
    <View style={styles.container}>
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
        title="Tämän päivän muistutukset"
        message={reminderToastMessage}
        visible={showReminderToast}
        onHide={() => setShowReminderToast(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Päiväkirjani</Text>
          
          {/* Search Icon */}
          <TouchableOpacity
            style={styles.searchIconButton}
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
            style={styles.reminderButton}
            onPress={() => navigation.navigate('Reminders')}
          >
            <Text style={styles.reminderIconText}>⏰</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Profile')}
          >
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} />
            ) : (
              <Text style={styles.profileIcon}>👤</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {/* Search Input - Toggleable */}
        {showSearch && (
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInputField}
              placeholder="Hae merkinnöistä..."
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

      {/* Achievements Section - Horizontal Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.achievementsScroll}
        style={styles.achievementsContainer}
      >
        {achievements.map((achievement) => {
          const isUnlocked = unlockedAchievementIds.includes(achievement.id);
          const progress = getAchievementProgress(achievement);

          return (
            <View
              key={achievement.id}
              style={[
                styles.achievementCard,
                !isUnlocked && styles.achievementCardLocked,
              ]}
            >
              <Text
                style={[
                  styles.achievementCardIcon,
                  !isUnlocked && styles.achievementCardIconLocked,
                ]}
              >
                {achievement.icon}
              </Text>
              <Text
                style={[
                  styles.achievementCardTitle,
                  !isUnlocked && styles.achievementCardTitleLocked,
                ]}
                numberOfLines={2}
              >
                {achievement.name}
              </Text>
              <View style={styles.progressBarContainerCompact}>
                <View
                  style={[
                    styles.progressBarCompact,
                    { width: `${progress.progress}%` },
                    !isUnlocked && styles.progressBarCompactLocked,
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.achievementCardProgress,
                  !isUnlocked && styles.achievementCardProgressLocked,
                ]}
              >
                {Math.min(progress.current, progress.target)} / {progress.target}
              </Text>
              {isUnlocked && (
                <View style={styles.achievementUnlockedBadge}>
                  <Text style={styles.achievementUnlockedText}>✓</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Entries List */}
      <FlatList
        data={filteredEntries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          entriesLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingEntriesText}>Ladataan merkintöjä...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>{searchQuery.trim() ? '🔍' : '📖'}</Text>
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery.trim()
                  ? `Ei tuloksia haulle "${searchQuery}"`
                  : 'Aloita päiväkirjan kirjoittaminen'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim()
                  ? 'Kokeile erilaista hakusanaa'
                  : 'Tallenna muistosi ja hetket helposti\npäivä kerrallaan'}
              </Text>
              {!searchQuery.trim() && (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => navigation.navigate('NewEntry')}
                >
                  <Text style={styles.emptyButtonText}>✨ Luo ensimmäinen merkintä</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
      />

      {/* Floating Action Button */}
      {entries.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('NewEntry')}
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
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...commonStyles.bodySecondary,
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
    height: 170,
  },
  achievementsScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
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
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timelineGridImageWrapper: {
    position: 'relative',
    width: (width - spacing.lg * 2 - spacing.xs) / 2,
    height: 120,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
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
