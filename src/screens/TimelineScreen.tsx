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
  Animated,
  TextInput,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DiaryEntry } from '../types/DiaryEntry';
import { useAuth } from '../contexts/AuthContext';
import { getEntries, getUserProfile } from '../services/diaryService';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';
import AchievementToast from '../components/AchievementToast';
import { sendAchievementNotification } from '../services/notificationService';
import {
  getUnlockedAchievementIds,
  addUnlockedAchievement,
} from '../services/achievementStorageService';
import {
  calculateStats,
  getNextAchievement,
  getProgressToNext,
  checkNewAchievements,
  Achievement,
  Stats,
} from '../utils/achievementUtils';

const { width } = Dimensions.get('window');
type LayoutType = 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';

export default function TimelineScreen({ navigation }: any) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
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
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<number[]>([]);
  const { user } = useAuth();
  
  // Muista viimeiset tilastot joista näytettiin toast
  const lastProcessedStats = useRef<Stats | null>(null);

  // Suodata merkinnät hakutermin perusteella
  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const titleMatch = entry.title.toLowerCase().includes(query);
    const contentMatch = entry.content.toLowerCase().includes(query);
    const locationMatch = entry.location?.address?.toLowerCase().includes(query) || false;
    
    return titleMatch || contentMatch || locationMatch;
  });

  useEffect(() => {
    if (user) {
      // Ladataan saavutukset ENSIN, sitten vasta entries
      // Näin unlockedAchievementIds on päivitetty ennen saavutusten tarkistusta
      loadUnlockedAchievements().then((ids) => {
        loadEntries(ids);
      });
      loadUserProfile();
    }
  }, [user]);

  // Ladataan entryt uudelleen kun palataan tähän screeniin
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        // Lataa saavutukset ensin, sitten entries
        loadUnlockedAchievements().then((ids) => {
          loadEntries(ids);
        });
        loadUserProfile();
      }
    }, [user])
  );

  const loadUnlockedAchievements = async (): Promise<number[]> => {
    if (!user) return [];
    
    try {
      const ids = await getUnlockedAchievementIds(user.uid);
      setUnlockedAchievementIds(ids);
      console.log(`Loaded ${ids.length} previously unlocked achievements`);
      return ids;
    } catch (error) {
      console.error('Error loading unlocked achievements:', error);
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
      console.error('Error loading user profile:', error);
    }
  };

  const loadEntries = async (unlockedIds?: number[]) => {
    if (!user) return;
    
    // Use provided IDs or fall back to state (for refresh scenarios)
    const previouslyUnlockedIds = unlockedIds !== undefined ? unlockedIds : unlockedAchievementIds;
    
    try {
      const userEntries = await getEntries(user.uid);
      console.log('TimelineScreen - Loaded entries:', userEntries.length);
      console.log('Entries with shared=true:', userEntries.filter(e => e.shared).length);
      console.log('Previously unlocked achievements:', previouslyUnlockedIds.length);
      
      // Calculate new stats
      const newStats = calculateStats(userEntries);
      
      // Check for new achievements based on current stats
      // Compare with previously unlocked achievement IDs stored in AsyncStorage
      const allPossibleAchievements = checkNewAchievements(
        { totalEntries: 0, totalImages: 0, longestStreak: 0, currentStreak: 0, firstEntryDate: null, totalWords: 0, multiDayCount: 0, sharedCount: 0, entriesWithLocation: 0, earlyBirdCount: 0, nightOwlCount: 0, weekendCount: 0, maxImagesInEntry: 0 },
        newStats
      );
      
      // Filter out achievements that were already unlocked (saved in AsyncStorage)
      const newAchievements = allPossibleAchievements.filter(
        achievement => !previouslyUnlockedIds.includes(achievement.id)
      );
      
      console.log('All possible achievements:', allPossibleAchievements.map(a => a.id));
      console.log('New achievements to show:', newAchievements.map(a => a.id));
      
      if (newAchievements.length > 0 && user) {
        // Update ref to prevent showing same toasts again
        lastProcessedStats.current = newStats;
        
        // Save newly unlocked achievements to AsyncStorage
        for (const achievement of newAchievements) {
          await addUnlockedAchievement(user.uid, achievement.id);
        }
        
        // Update local state
        setUnlockedAchievementIds(prev => [...prev, ...newAchievements.map(a => a.id)]);
        
        // Show toast for the first new achievement
        setAchievementToast(newAchievements[0]);
        setShowToast(true);
        
        // Send notification for first achievement
        sendAchievementNotification(newAchievements[0].name, newAchievements[0].description);
        
        // If there are multiple achievements, show them one by one
        if (newAchievements.length > 1) {
          for (let i = 1; i < Math.min(3, newAchievements.length); i++) {
            setTimeout(() => {
              setAchievementToast(newAchievements[i]);
              setShowToast(true);
              // Send notification for additional achievements
              sendAchievementNotification(newAchievements[i].name, newAchievements[i].description);
            }, i * 5500); // 5.5 second delay between each toast
          }
        }
      }
      
      setStats(newStats);
      setEntries(userEntries);
    } catch (error) {
      console.error('Error loading entries:', error);
      setEntries([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const ids = await loadUnlockedAchievements();
    await loadEntries(ids);
    setRefreshing(false);
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
      {(() => {
        const nextAchievement = getNextAchievement(stats);
        const progress = getProgressToNext(stats);
        
        return (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.achievementsScroll}
            style={styles.achievementsContainer}
          >
            {/* Current Streak Card */}
            <View style={styles.achievementCard}>
              <Text style={styles.achievementCardIcon}>🔥</Text>
              <Text style={styles.achievementCardValue}>{stats.currentStreak}</Text>
              <Text style={styles.achievementCardLabel}>päivän putki</Text>
            </View>

            {/* Next Achievement Card */}
            {nextAchievement && (
              <View style={[styles.achievementCard, styles.nextAchievementCardCompact]}>
                <Text style={styles.achievementCardIcon}>{nextAchievement.icon}</Text>
                <Text style={styles.achievementCardTitle} numberOfLines={1}>
                  {nextAchievement.name}
                </Text>
                <View style={styles.progressBarContainerCompact}>
                  <View style={[styles.progressBarCompact, { width: `${progress.progress}%` }]} />
                </View>
                <Text style={styles.achievementCardProgress}>
                  {progress.current} / {progress.target}
                </Text>
              </View>
            )}

            {/* Stats Cards */}
            <View style={styles.achievementCard}>
              <Text style={styles.achievementCardIcon}>📝</Text>
              <Text style={styles.achievementCardValue}>{stats.totalEntries}</Text>
              <Text style={styles.achievementCardLabel}>merkintää</Text>
            </View>

            <View style={styles.achievementCard}>
              <Text style={styles.achievementCardIcon}>📷</Text>
              <Text style={styles.achievementCardValue}>{stats.totalImages}</Text>
              <Text style={styles.achievementCardLabel}>kuvaa</Text>
            </View>

            <View style={styles.achievementCard}>
              <Text style={styles.achievementCardIcon}>🏆</Text>
              <Text style={styles.achievementCardValue}>{stats.longestStreak}</Text>
              <Text style={styles.achievementCardLabel}>pisin putki</Text>
            </View>
          </ScrollView>
        );
      })()}

      {/* Entries List */}
      <FlatList
        data={filteredEntries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
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
    width: 105,
    height: 100,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  achievementCardIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
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
  nextAchievementCardCompact: {
    width: 135,
    height: 100,
  },
  achievementCardTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
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
  achievementCardProgress: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
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
});
