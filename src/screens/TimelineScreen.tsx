import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Animated,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DiaryEntry } from '../types/DiaryEntry';
import { useAuth } from '../contexts/AuthContext';
import { getEntries, getUserProfile } from '../services/diaryService';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

export default function TimelineScreen({ navigation }: any) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();

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
      loadEntries();
      loadUserProfile();
    }
  }, [user]);

  // Ladataan entryt uudelleen kun palataan tähän screeniin
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadEntries();
        loadUserProfile();
      }
    }, [user])
  );

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

  const loadEntries = async () => {
    if (!user) return;
    
    try {
      const userEntries = await getEntries(user.uid);
      setEntries(userEntries);
    } catch (error) {
      console.error('Error loading entries:', error);
      setEntries([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEntries();
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

  const renderEntry = ({ item }: { item: DiaryEntry }) => {
    // Text Overlay Mode
    if (item.textOverlay && item.images.length > 0) {
      return (
        <View style={styles.entryCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              navigation.navigate('EntryDetail', {
                entry: item,
                onUpdate: loadEntries,
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
                        {item.location.address}
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

    // Normal Mode
    return (
    <View style={styles.entryCard}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          navigation.navigate('EntryDetail', {
            entry: item,
            onUpdate: loadEntries,
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

        {/* Images Grid */}
        {item.images.length > 0 && (
          <View style={styles.imagesGrid}>
            {item.images.slice(0, 4).map((imageUri, imgIndex) => (
              <View
                key={imgIndex}
                style={[
                  styles.imageWrapper,
                  item.images.length === 1 && styles.singleImage,
                  item.images.length >= 2 && styles.multiImage,
                  // Apply image shape from entry settings
                  item.imageShape === 'circle' && styles.circleImageWrapper,
                  item.imageShape === 'landscape' && styles.landscapeImageWrapper,
                ]}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={styles.image}
                />
                {item.images.length > 4 && imgIndex === 3 && (
                  <View style={styles.moreImagesOverlay}>
                    <Text style={styles.moreImagesText}>
                      +{item.images.length - 4}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Entry Footer */}
        <View style={styles.entryFooter}>
          {item.location && (
            <View style={styles.locationContainer}>
              <Text style={styles.locationIcon}>📍</Text>
              <Text style={styles.locationText} numberOfLines={1}>
                {item.location.address}
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Päiväkirjani</Text>
            <Text style={styles.headerSubtitle}>
              {entries.length} {entries.length === 1 ? 'merkintä' : 'merkintää'}
            </Text>
          </View>
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
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Hae merkinnöistä..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
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

      {/* Search Results Info */}
      {searchQuery.trim() && (
        <View style={styles.searchResultsInfo}>
          <Text style={styles.searchResultsText}>
            {filteredEntries.length === 0
              ? 'Ei tuloksia'
              : `${filteredEntries.length} ${filteredEntries.length === 1 ? 'tulos' : 'tulosta'}`}
          </Text>
        </View>
      )}

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
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...commonStyles.heading1,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...commonStyles.bodySecondary,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  searchIcon: {
    fontSize: typography.fontSizes.lg,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearButtonText: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.bold
  },
  searchResultsInfo: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchResultsText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.medium,
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
});
