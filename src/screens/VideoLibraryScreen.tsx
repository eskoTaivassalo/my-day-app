import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Video,ResizeMode } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../contexts/AuthContext';
import { getEntries } from '../services/diaryService';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

interface VideoItem {
  uri: string;
  entryId: string;
  date: Date;
}

export default function VideoLibraryScreen({ navigation }: any) {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'limited' | 'denied'>('unknown');
  const [permissionAsked, setPermissionAsked] = useState(false);

  const selectedCount = selectedUris.length;
  const selectedSet = useMemo(() => new Set(selectedUris), [selectedUris]);

  useEffect(() => {
    if (user) {
      loadVideos();
    }
  }, [user]);

  useEffect(() => {
    loadPermissionStatus();
  }, []);

  const loadVideos = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const entries = await getEntries(user.uid);
      const allVideos: VideoItem[] = [];

      entries.forEach((entry) => {
        (entry.videos || []).forEach((uri) => {
          allVideos.push({ uri, entryId: entry.id, date: entry.date });
        });
      });

      setVideos(allVideos);
    } catch (error) {
      console.error('Error loading video library:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPermissionStatus = async () => {
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      setPermissionStatus(status as 'granted' | 'limited' | 'denied');
    } catch (error) {
      console.error('Error loading media library permission:', error);
    }
  };

  const ensureMediaLibraryPermission = async () => {
    if (permissionStatus === 'granted' || permissionStatus === 'limited') {
      return true;
    }

    if (permissionStatus === 'denied' && permissionAsked) {
      Alert.alert(
        'Lupa vaaditaan',
        'Videoiden tallentaminen vaatii mediakirjaston luvan. Voit myöntää luvan laitteen asetuksista.'
      );
      return false;
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    const nextStatus = status as 'granted' | 'limited' | 'denied';
    setPermissionStatus(nextStatus);
    setPermissionAsked(true);
    return nextStatus === 'granted' || nextStatus === 'limited';
  };

  const addAssetToAlbum = async (asset: MediaLibrary.Asset, albumName: string) => {
    let album = await MediaLibrary.getAlbumAsync(albumName);

    if (!album) {
      album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
      return;
    }

    await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
  };

  const toggleSelection = (uri: string) => {
    setSelectedUris((prev) => {
      if (prev.includes(uri)) {
        return prev.filter((item) => item !== uri);
      }
      return [...prev, uri];
    });
  };

  const selectAllVideos = () => {
    setSelectedUris(videos.map((video) => video.uri));
  };

  const saveSelectedVideos = async () => {
    if (selectedUris.length === 0) return;

    const hasPermission = await ensureMediaLibraryPermission();
    if (!hasPermission) {
      Alert.alert('Lupa vaaditaan', 'Videoiden tallentaminen vaatii mediakirjaston luvan.');
      return;
    }

    try {
      setDownloading(true);
      let savedCount = 0;
      let album = await MediaLibrary.getAlbumAsync('MyDayApp Videos');

      for (const uri of selectedUris) {
        try {
          const filename = `myday_video_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
          const downloadPath = `${FileSystem.cacheDirectory}${filename}`;
          const download = await FileSystem.downloadAsync(uri, downloadPath);
          const asset = await MediaLibrary.createAssetAsync(download.uri);

          if (!album) {
            album = await MediaLibrary.createAlbumAsync('MyDayApp Videos', asset, false);
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }

          savedCount += 1;
        } catch (innerError) {
          console.error('Error saving video:', innerError);
        }
      }

      Alert.alert('Valmis', `Tallennettu ${savedCount} videota MyDayApp Videos -albumiin.`);
      setSelectedUris([]);
    } catch (error) {
      console.error('Error saving selected videos:', error);
      Alert.alert('Virhe', 'Videoiden tallennus epäonnistui.');
    } finally {
      setDownloading(false);
    }
  };

  const renderItem = ({ item }: { item: VideoItem }) => {
    const isSelected = selectedSet.has(item.uri);

    return (
      <TouchableOpacity
        style={[styles.videoWrapper, isSelected && styles.videoSelected]}
        onPress={() => toggleSelection(item.uri)}
        activeOpacity={0.8}
      >
        <Video
          source={{ uri: item.uri }}
          style={styles.video}
          resizeMode={ResizeMode.COVER} 
          useNativeControls
          shouldPlay={false}
        />
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Takaisin</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Videopankki</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Ladataan videoita...</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {videos.length > 0 && (
            <View style={styles.selectAllBar}>
              <TouchableOpacity onPress={selectAllVideos}>
                <Text style={styles.selectAllText}>Valitse kaikki</Text>
              </TouchableOpacity>
              {selectedCount > 0 && (
                <TouchableOpacity onPress={() => setSelectedUris([])}>
                  <Text style={styles.selectAllClear}>Tyhjennä</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <FlatList
            data={videos}
            keyExtractor={(item, index) => `${item.entryId}_${index}`}
            numColumns={2}
            contentContainerStyle={styles.grid}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Ei videoita</Text>
                <Text style={styles.emptySubtitle}>Lisää videoita merkintöihin, niin ne näkyvät täällä.</Text>
              </View>
            }
          />
        </View>
      )}

      {selectedCount > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>Valittu {selectedCount} kpl</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionButton} onPress={saveSelectedVideos}>
              <Text style={styles.selectionButtonText}>Tallenna valitut</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionButton, styles.selectionClearButton]}
              onPress={() => setSelectedUris([])}
            >
              <Text style={styles.selectionClearText}>Tyhjennä</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {downloading && (
        <View style={styles.downloadingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.downloadingText}>Tallennetaan...</Text>
        </View>
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
  grid: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  listContainer: {
    flex: 1,
  },
  selectAllBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  selectAllText: {
    color: colors.primary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  selectAllClear: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  videoWrapper: {
    flex: 1,
    aspectRatio: 1,
    margin: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  videoSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  selectedBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: typography.fontWeights.bold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  emptyTitle: {
    ...commonStyles.heading2,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...commonStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  downloadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadingText: {
    marginTop: spacing.sm,
    color: colors.white,
  },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    padding: spacing.md,
  },
  selectionText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  selectionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectionButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  selectionButtonText: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.sm,
  },
  selectionClearButton: {
    backgroundColor: colors.gray100,
  },
  selectionClearText: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.sm,
  },
});
