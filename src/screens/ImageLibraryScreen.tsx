import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getEntries } from '../services/diaryService';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

interface ImageItem {
  uri: string;
  entryId: string;
  date: Date;
}

export default function ImageLibraryScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'limited' | 'denied'>('unknown');
  const [permissionAsked, setPermissionAsked] = useState(false);

  const isSelectionMode = selectedUris.length > 0;
  const selectedCount = selectedUris.length;
  const selectedSet = useMemo(() => new Set(selectedUris), [selectedUris]);

  useEffect(() => {
    if (user) {
      loadImages();
    }
  }, [user]);

  useEffect(() => {
    loadPermissionStatus();
  }, []);

  const loadImages = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const entries = await getEntries(user.uid);
      const allImages: ImageItem[] = [];

      entries.forEach((entry) => {
        entry.images.forEach((uri) => {
          allImages.push({ uri, entryId: entry.id, date: entry.date });
        });
      });

      setImages(allImages);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  const ensureMediaLibraryPermission = async () => {
    if (permissionStatus === 'granted' || permissionStatus === 'limited') {
      return true;
    }

    if (permissionStatus === 'denied' && permissionAsked) {
      Alert.alert(
        t('common_permission_required'),
        t('image_library_permission1')
      );
      return false;
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    const nextStatus = status as 'granted' | 'limited' | 'denied';
    setPermissionStatus(nextStatus);
    setPermissionAsked(true);
    return nextStatus === 'granted' || nextStatus === 'limited';
  };

  const loadPermissionStatus = async () => {
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      setPermissionStatus(status as 'granted' | 'limited' | 'denied');
    } catch {
      setPermissionStatus('unknown');
    }
  };

  const addAssetToAlbum = async (asset: MediaLibrary.Asset, albumName: string) => {
    let album = await MediaLibrary.getAlbumAsync(albumName);

    if (!album) {
      album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
      return;
    }

    await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
  };

  const saveImageToLibrary = async (uri: string) => {
    const hasPermission = await ensureMediaLibraryPermission();
    if (!hasPermission) {
      Alert.alert(t('common_permission_required'), t('image_library_permission2'));
      return;
    }

    try {
      setDownloading(true);
      const filename = `myday_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const downloadPath = `${FileSystem.cacheDirectory}${filename}`;
      const download = await FileSystem.downloadAsync(uri, downloadPath);
      const asset = await MediaLibrary.createAssetAsync(download.uri);

      await addAssetToAlbum(asset, 'MyDayApp');
      Alert.alert(t('common_success'), t('image_library_saved_single'));
    } catch {
      Alert.alert(t('common_error'), t('image_library_save_failed'));
    } finally {
      setDownloading(false);
    }
  };

  const toggleSelection = (uri: string) => {
    setSelectedUris((prev) => {
      if (prev.includes(uri)) {
        return prev.filter((item) => item !== uri);
      }
      return [...prev, uri];
    });
  };

  const saveSelectedImages = async () => {
    if (selectedUris.length === 0) return;

    const hasPermission = await ensureMediaLibraryPermission();
    if (!hasPermission) {
      Alert.alert(t('common_permission_required'), t('image_library_permission2'));
      return;
    }

    try {
      setDownloading(true);
      let savedCount = 0;

      let album = await MediaLibrary.getAlbumAsync('MyDayApp');

      for (const uri of selectedUris) {
        try {
          const filename = `myday_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const downloadPath = `${FileSystem.cacheDirectory}${filename}`;
          const download = await FileSystem.downloadAsync(uri, downloadPath);
          const asset = await MediaLibrary.createAssetAsync(download.uri);

          if (!album) {
            album = await MediaLibrary.createAlbumAsync('MyDayApp', asset, false);
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }
          savedCount += 1;
        } catch {
        }
      }

      Alert.alert(t('common_done'), t('image_library_saved_batch', { count: savedCount }));
      setSelectedUris([]);
    } catch {
      Alert.alert(t('common_error'), t('image_library_save_failed'));
    } finally {
      setDownloading(false);
    }
  };

  const selectAllImages = () => {
    setSelectedUris(images.map((image) => image.uri));
  };

  const renderItem = ({ item }: { item: ImageItem }) => {
    const isSelected = selectedSet.has(item.uri);

    return (
      <TouchableOpacity
        style={[
          styles.imageWrapper,
          { backgroundColor: isDark ? '#1E293B' : colors.gray100 },
          isSelected && [styles.imageSelected, { borderColor: theme.colors.primary }],
        ]}
        onPress={() => {
          if (isSelectionMode) {
            toggleSelection(item.uri);
          } else {
            saveImageToLibrary(item.uri);
          }
        }}
        onLongPress={() => toggleSelection(item.uri)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.uri }} style={styles.image} />
        {isSelected ? (
          <View style={[styles.selectedBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.selectedBadgeText}>✓</Text>
          </View>
        ) : (
          <View style={styles.downloadBadge}>
            <Text style={styles.downloadBadgeText}>⬇️</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }] }>
      <View style={[styles.header, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }] }>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('common_back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('image_library_header')}</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('image_library_loading')}</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {images.length > 0 && (
            <View style={[styles.selectAllBar, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }]}>
              <TouchableOpacity onPress={selectAllImages}>
                <Text style={[styles.selectAllText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('image_library_select_all')}</Text>
              </TouchableOpacity>
              {selectedCount > 0 && (
                <TouchableOpacity onPress={() => setSelectedUris([])}>
                  <Text style={[styles.selectAllClear, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('image_library_clear')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <FlatList
            data={images}
            keyExtractor={(item, index) => `${item.entryId}_${index}`}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>{t('image_library_empty_title')}</Text>
                <Text style={styles.emptySubtitle}>{t('image_library_empty_sub')}</Text>
              </View>
            }
          />
        </View>
      )}

      {selectedCount > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: theme.colors.white, borderTopColor: theme.colors.border }]}>
          <Text style={[styles.selectionText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('image_library_selected', { count: selectedCount })}</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={[styles.selectionButton, { backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary }]} onPress={saveSelectedImages}>
              <Text style={[styles.selectionButtonText, { fontFamily: theme.fonts.bodyFamily }]}>{t('image_library_save_selected')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionButton, styles.selectionClearButton, { backgroundColor: isDark ? '#1E293B' : colors.gray100 }]}
              onPress={() => setSelectedUris([])}
            >
              <Text style={[styles.selectionClearText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('image_library_clear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {downloading && (
        <View style={styles.downloadingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.downloadingText}>{t('image_library_saving')}</Text>
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
  imageWrapper: {
    flex: 1,
    aspectRatio: 1,
    margin: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
  },
  imageSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  downloadBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  downloadBadgeText: {
    color: colors.white,
    fontSize: 12,
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
