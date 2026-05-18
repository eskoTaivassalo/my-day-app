import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Näyttää ensin kuvan ilman kehystä.
 * Yksinkertainen kehyskuva preview-näkymään.
 */
function FramedPhoto({ uri, style }: { uri: string; style: any }) {
  return (
    <Image source={{ uri }} style={style} resizeMode="cover" />
  );
}
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useAuth } from '../contexts/AuthContext';
import { useAppLock } from '../contexts/AppLockContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import { createEntry, uploadImages, uploadVideos } from '../services/diaryService';
import { colors, spacing, borderRadius, typography } from '../theme/theme';

type LayoutType = 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';
type EntryLocation = { latitude: number; longitude: number; address?: string };

interface NewEntryDraft {
  title: string;
  content: string;
  selectedDate: string;
  selectedImages: string[];
  selectedVideos: string[];
  selectedVideoThumbnails: Record<string, string>;
  layout: LayoutType;
  location: EntryLocation | null;
}

export default function NewEntryScreen({ navigation, route }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [selectedVideoThumbnails, setSelectedVideoThumbnails] = useState<Record<string, string>>({});
  const [isPreparingVideos, setIsPreparingVideos] = useState(false);
  const [layout, setLayout] = useState<LayoutType>('grid');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [location, setLocation] = useState<EntryLocation | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const { user } = useAuth();
  const { suppressNextBackgroundLock } = useAppLock();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const locale = getLocaleFromLanguage(language);
  const skipDiscardPromptRef = useRef(false);
  const selectedVideosRef = useRef<string[]>([]);
  const draftHydratedRef = useRef(false);
  const draftStorageKey = user ? `new_entry_draft:${user.uid}` : null;

  useEffect(() => {
    selectedVideosRef.current = selectedVideos;
  }, [selectedVideos]);

  const appendSelectedVideos = (newVideos: string[]) => {
    if (newVideos.length === 0) {
      return;
    }

    const mergedVideos = [...selectedVideosRef.current, ...newVideos];
    selectedVideosRef.current = mergedVideos;
    setSelectedVideos(mergedVideos);
  };

  const hasDraftChanges = () => {
    return (
      title.trim().length > 0 ||
      content.trim().length > 0 ||
      selectedImages.length > 0 ||
      selectedVideos.length > 0 ||
      !!location ||
      layout !== 'grid'
    );
  };

  const clearDraft = async () => {
    if (!draftStorageKey) {
      return;
    }
    try {
      await AsyncStorage.removeItem(draftStorageKey);
    } catch {
    }
  };

  const saveDraft = async () => {
    if (!draftStorageKey || !draftHydratedRef.current || saving) {
      return;
    }

    if (!hasDraftChanges()) {
      await clearDraft();
      return;
    }

    const draft: NewEntryDraft = {
      title,
      content,
      selectedDate: selectedDate.toISOString(),
      selectedImages,
      selectedVideos,
      selectedVideoThumbnails,
      layout,
      location,
    };

    try {
      await AsyncStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
    }
  };

  useEffect(() => {
    let isMounted = true;
    draftHydratedRef.current = false;

    const restoreDraft = async () => {
      if (!draftStorageKey) {
        draftHydratedRef.current = true;
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(draftStorageKey);
        if (!raw || !isMounted) {
          return;
        }

        const draft = JSON.parse(raw) as Partial<NewEntryDraft>;

        if (typeof draft.title === 'string') {
          setTitle(draft.title);
        }
        if (typeof draft.content === 'string') {
          setContent(draft.content);
        }
        if (typeof draft.selectedDate === 'string') {
          const parsedDate = new Date(draft.selectedDate);
          if (!Number.isNaN(parsedDate.getTime())) {
            setSelectedDate(parsedDate);
          }
        }
        if (Array.isArray(draft.selectedImages)) {
          setSelectedImages(draft.selectedImages.filter((uri): uri is string => typeof uri === 'string'));
        }
        if (Array.isArray(draft.selectedVideos)) {
          const restoredVideos = draft.selectedVideos.filter((uri): uri is string => typeof uri === 'string');
          setSelectedVideos(restoredVideos);
          selectedVideosRef.current = restoredVideos;
        }
        if (draft.selectedVideoThumbnails && typeof draft.selectedVideoThumbnails === 'object') {
          setSelectedVideoThumbnails(draft.selectedVideoThumbnails as Record<string, string>);
        }
        if (draft.layout && ['grid', 'masonry', 'magazine', 'full', 'framed', 'overlay'].includes(draft.layout)) {
          setLayout(draft.layout as LayoutType);
        }
        if (draft.location && typeof draft.location === 'object') {
          setLocation(draft.location as EntryLocation);
        }
      } catch {
      } finally {
        draftHydratedRef.current = true;
      }
    };

    void restoreDraft();

    return () => {
      isMounted = false;
      draftHydratedRef.current = false;
    };
  }, [draftStorageKey]);

  // Clear form when explicitly requested via navigation params or on fresh navigation
  useFocusEffect(
    useCallback(() => {
      // If route.params.clearForm is explicitly true, clear the form
      if (route?.params?.clearForm === true) {
        setTitle('');
        setContent('');
        setSelectedDate(new Date());
        setSelectedImages([]);
        setSelectedVideos([]);
        selectedVideosRef.current = [];
        setSelectedVideoThumbnails({});
        setLayout('grid');
        setLocation(null);
        
        // Also clear the draft from storage
        void clearDraft();
      }
    }, [route?.params?.clearForm, draftStorageKey])
  );

  useEffect(() => {
    if (!draftHydratedRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      void saveDraft();
    }, 700);

    return () => {
      clearTimeout(timer);
    };
  }, [
    title,
    content,
    selectedDate,
    selectedImages,
    selectedVideos,
    selectedVideoThumbnails,
    layout,
    location,
    saving,
    draftStorageKey,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'inactive' || nextState === 'background') {
        void saveDraft();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    title,
    content,
    selectedDate,
    selectedImages,
    selectedVideos,
    selectedVideoThumbnails,
    layout,
    location,
    saving,
    draftStorageKey,
  ]);

  const resolveVideoThumbnailsForUris = async (uris: string[]) => {
    const uniqueUris = Array.from(new Set(uris));
    if (uniqueUris.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      uniqueUris.map(async (uri) => {
        const generated = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 0,
          quality: 0.35,
        });

        return { uri, thumbnailUri: generated?.uri };
      })
    );

    setSelectedVideoThumbnails((prev) => {
      let changed = false;
      const next = { ...prev };

      results.forEach((result) => {
        if (result.status !== 'fulfilled') {
          return;
        }

        const { uri, thumbnailUri } = result.value;
        if (!thumbnailUri || next[uri] === thumbnailUri) {
          return;
        }

        next[uri] = thumbnailUri;
        changed = true;
      });

      return changed ? next : prev;
    });
  };

  const confirmDiscardDraft = (onConfirm: () => void) => {
    Alert.alert(
      t('new_entry_discard_title'),
      t('new_entry_discard_msg'),
      [
        { text: t('common_no'), style: 'cancel' },
        {
          text: t('common_yes'),
          style: 'destructive',
          onPress: async () => {
            skipDiscardPromptRef.current = true;
            await clearDraft();
            onConfirm();
          },
        },
      ]
    );
  };

  const handleCancelEntry = () => {
    if (!hasDraftChanges() || saving) {
      navigation.goBack();
      return;
    }

    confirmDiscardDraft(() => navigation.goBack());
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (skipDiscardPromptRef.current || saving || !hasDraftChanges()) {
        return;
      }

      e.preventDefault();
      confirmDiscardDraft(() => navigation.dispatch(e.data.action));
    });

    return unsubscribe;
  }, [navigation, saving, title, content, selectedImages, selectedVideos, location, layout]);

  useEffect(() => {
    let isMounted = true;

    const resolveSelectedVideoThumbnails = async () => {
      const missingUris = selectedVideos.filter((uri) => !selectedVideoThumbnails[uri]);
      if (missingUris.length > 0) {
        await resolveVideoThumbnailsForUris(missingUris);
      }

      if (!isMounted) {
        return;
      }

      setSelectedVideoThumbnails((prev) => {
        const nextEntries = Object.entries(prev).filter(([uri]) => selectedVideos.includes(uri));
        return nextEntries.length === Object.keys(prev).length ? prev : Object.fromEntries(nextEntries);
      });
    };

    void resolveSelectedVideoThumbnails();

    return () => {
      isMounted = false;
    };
  }, [selectedVideos, selectedVideoThumbnails]);

  const getLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common_permission_required'), t('entry_location_permission'));
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = currentLocation.coords;

      // Hae osoite koordinaateista
      try {
        const [addressData] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const address = addressData
          ? `${addressData.city || ''}, ${addressData.country || ''}`.trim().replace(/^,\s*/, '')
          : undefined;
        
        setLocation({ latitude, longitude, address });
        Alert.alert(t('common_location_added'), address || t('common_location_saved'));
      } catch {
        setLocation({ latitude, longitude });
        Alert.alert(t('common_location_added'), t('common_location_saved'));
      }
    } catch {
      Alert.alert(t('common_error'), t('entry_location_failed'));
    } finally {
      setLoadingLocation(false);
    }
  };

  const pickImageFromGallery = async () => {
    suppressNextBackgroundLock();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map((asset) => asset.uri);
      setSelectedImages((prev) => [...prev, ...newImages]);
    }
  };

  const takePhoto = async () => {
    suppressNextBackgroundLock();
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(t('common_permission_required'), t('entry_camera_photo_permission'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets) {
      setSelectedImages((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removeSelectedImage = (uri: string) => {
    setSelectedImages((prev) => prev.filter((img) => img !== uri));
  };

  const pickVideoFromGallery = async () => {
    suppressNextBackgroundLock();
    setIsPreparingVideos(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos',
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 1,
      });

      if (!result.canceled && result.assets) {
        const newVideos = result.assets.map((asset) => asset.uri);
        appendSelectedVideos(newVideos);
        await resolveVideoThumbnailsForUris(newVideos);
      }
    } finally {
      setIsPreparingVideos(false);
    }
  };

  const recordVideo = async () => {
    suppressNextBackgroundLock();
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(t('common_permission_required'), t('entry_camera_permission'));
      return;
    }

    setIsPreparingVideos(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'videos',
        quality: 1,
        videoMaxDuration: 120,
      });

      if (!result.canceled && result.assets) {
        const recordedUri = result.assets[0].uri;
        appendSelectedVideos([recordedUri]);
        await resolveVideoThumbnailsForUris([recordedUri]);
      }
    } finally {
      setIsPreparingVideos(false);
    }
  };

  const removeSelectedVideo = (uri: string) => {
    setSelectedVideos((prev) => prev.filter((video) => video !== uri));
    setSelectedVideoThumbnails((prev) => {
      if (!prev[uri]) {
        return prev;
      }
      const next = { ...prev };
      delete next[uri];
      return next;
    });
  };

  const renderImages = () => {
    if (selectedImages.length === 0) return null;

    switch (layout) {
      case 'grid':
        return (
          <View style={previewStyles.gridContainer}>
            {selectedImages.map((uri, index) => (
              <Image key={index} source={{ uri }} style={previewStyles.gridImage} />
            ))}
          </View>
        );

      case 'masonry':
        const leftImages = selectedImages.filter((_, i) => i % 2 === 0);
        const rightImages = selectedImages.filter((_, i) => i % 2 === 1);
        return (
          <View style={previewStyles.masonryContainer}>
            <View style={previewStyles.masonryColumn}>
              {leftImages.map((uri, index) => (
                <Image key={index} source={{ uri }} style={previewStyles.masonryImage} />
              ))}
            </View>
            <View style={previewStyles.masonryColumn}>
              {rightImages.map((uri, index) => (
                <Image key={index} source={{ uri }} style={previewStyles.masonryImage} />
              ))}
            </View>
          </View>
        );

      case 'magazine':
        if (selectedImages.length === 1) {
          return <Image source={{ uri: selectedImages[0] }} style={previewStyles.magazineSingleImage} />;
        }
        return (
          <View style={previewStyles.magazineContainer}>
            <Image source={{ uri: selectedImages[0] }} style={previewStyles.magazineMainImage} />
            <View style={previewStyles.magazineThumbnails}>
              {selectedImages.slice(1, 3).map((uri, index) => (
                <Image key={index} source={{ uri }} style={previewStyles.magazineThumbnail} />
              ))}
            </View>
          </View>
        );

      case 'full':
        return (
          <View style={previewStyles.fullContainer}>
            {selectedImages.map((uri, index) => (
              <Image key={index} source={{ uri }} style={previewStyles.fullImage} />
            ))}
          </View>
        );

      case 'framed':
        return (
          <View style={previewStyles.framedContainer}>
            {selectedImages.map((uri, index) => (
              <View key={index} style={previewStyles.framedImageWrapper}>
                <FramedPhoto uri={uri} style={previewStyles.framedImage} />

              </View>
            ))}
          </View>
        );

      case 'overlay':
        if (selectedImages.length === 0) return null;
        return (
          <View style={previewStyles.overlayContainer}>
            <Image source={{ uri: selectedImages[0] }} style={previewStyles.overlayBackground} blurRadius={1} />
            <View style={previewStyles.overlayDark} />
            <View style={previewStyles.overlayTextContainer}>
              <Text style={previewStyles.overlayTitle}>{title || 'Otsikko'}</Text>
              <Text style={previewStyles.overlayContent} numberOfLines={3}>{content || 'Sisältö'}</Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const renderVideos = () => {
    if (selectedVideos.length === 0) return null;

    return (
      <View style={previewStyles.videoContainer}>
        {selectedVideos.map((uri, index) => (
          <View key={index} style={previewStyles.videoCard}>
            {selectedVideoThumbnails[uri] ? (
              <Image
                source={{ uri: selectedVideoThumbnails[uri] }}
                style={previewStyles.videoThumbnail}
              />
            ) : (
              <View style={previewStyles.videoIconBadge}>
                <Text style={previewStyles.videoIconText}>🎥</Text>
              </View>
            )}
            <View style={previewStyles.videoInfo}>
              <Text style={previewStyles.videoMeta}>
                {t('timeline_video_badge')} {index + 1}/{selectedVideos.length}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(t('new_entry_missing_title'), t('new_entry_missing_title_msg'));
      return;
    }

    if (!content.trim()) {
      Alert.alert(t('new_entry_missing_content'), t('new_entry_missing_content_msg'));
      return;
    }

    if (!user) {
      Alert.alert(t('common_error'), t('new_entry_not_logged_in'));
      return;
    }

    if (isPreparingVideos) {
      Alert.alert(t('common_error'), t('entry_uploading'));
      return;
    }

    const videosToUpload = selectedVideosRef.current;

    setSaving(true);
    try {
      // Upload images to Firebase Storage if any
      let imageUrls: string[] = [];
      if (selectedImages.length > 0) {
        imageUrls = await uploadImages(selectedImages, user.uid);
      }

      // Upload videos to Firebase Storage if any
      let videoUrls: string[] = [];
      let videoThumbnails: Record<string, string> = {};
      if (videosToUpload.length > 0) {
        setUploadProgress(0);
        try {
          const videoAssets = await uploadVideos(videosToUpload, user.uid, (progress) => {
            setUploadProgress(progress);
          });
          videoUrls = videoAssets.map((asset) => asset.videoUrl);
          videoThumbnails = videoAssets.reduce((acc, asset) => {
            if (asset.thumbnailUrl) {
              acc[asset.videoUrl] = asset.thumbnailUrl;
            }
            return acc;
          }, {} as Record<string, string>);
        } catch (videoError) {
          throw new Error(`Videoiden lataus epäonnistui: ${videoError}`);
        } finally {
          setUploadProgress(null);
        }
      }

      // Save entry to Firestore with selected date

      await createEntry(
        {
          title: title.trim(),
          content: content.trim(),
          images: imageUrls,
          videos: videoUrls,
          videoThumbnails,
          date: selectedDate,
          layout: layout,
          ...(location && { location }), // Lisää location vain jos se on olemassa
        },
        user.uid
      );

      // Show success message
      await clearDraft();
      Alert.alert(
        t('entry_saved'),
        t('new_entry_saved'),
        [
          {
            text: t('common_ok'),
            onPress: () => {
              skipDiscardPromptRef.current = true;
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Entry save error:', error);
      Alert.alert(t('common_error'), error instanceof Error ? error.message : t('new_entry_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.white }] }>
        <TouchableOpacity onPress={handleCancelEntry}>
          <Text style={[styles.cancelButton, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('common_cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('new_entry_header')}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || isPreparingVideos}>
          <Text style={[styles.saveButton, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }, (saving || isPreparingVideos) && styles.saveButtonDisabled]}>
            {uploadProgress !== null
              ? t('new_entry_loading', { progress: uploadProgress })
              : saving ? t('common_saving') : isPreparingVideos ? t('entry_uploading') : t('common_save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* INTERACTIVE PREVIEW CARD */}
        <View style={[styles.previewCard, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border, borderWidth: 1 }] }>
          {/* Date Header - Clickable */}
          <TouchableOpacity 
            style={previewStyles.entryHeader}
            onPress={() => setShowDatePicker(true)}
          >
            <View style={previewStyles.dateContainer}>
              <Text style={previewStyles.dayNumber}>
                {selectedDate.getDate()}
              </Text>
              <Text style={previewStyles.monthText}>
                {selectedDate.toLocaleDateString(locale, { month: 'short' })}
              </Text>
            </View>
            
            <View style={previewStyles.entryHeaderContent}>
              <Text style={previewStyles.entryDate}>
                {selectedDate.toLocaleDateString(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </Text>
              <Text style={previewStyles.entryTime}>
                {t('entry_tap_to_change_date')}
              </Text>
            </View>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) {
                  setSelectedDate(date);
                }
              }}
              maximumDate={new Date()}
            />
          )}

          {/* Title Input - Inline */}
          <TextInput
            style={[
              previewStyles.titleInput,
              {
                backgroundColor: isDark ? '#0B1220' : colors.gray50,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontFamily: theme.fonts.bodyFamily,
              },
            ]}
            placeholder={t('new_entry_title_placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          {/* Content Input - Inline */}
          <TextInput
            style={[
              previewStyles.contentInput,
              {
                backgroundColor: isDark ? '#0B1220' : colors.gray50,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontFamily: theme.fonts.bodyFamily,
              },
            ]}
            placeholder={t('new_entry_content_placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />

          {/* Images with layout */}
          {renderImages()}

          {/* Videos */}
          {renderVideos()}

          {/* Image Controls - Compact */}
          <View style={styles.imageControls}>
            <TouchableOpacity style={[styles.compactButton, { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' }]} onPress={takePhoto}>
              <Text style={styles.compactButtonIcon}>📷</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.compactButton, { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' }]} onPress={pickImageFromGallery}>
              <Text style={styles.compactButtonIcon}>🖼️</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.compactButton, { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' }]} onPress={recordVideo} disabled={saving || isPreparingVideos}>
              <Text style={styles.compactButtonIcon}>🎥</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.compactButton, { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' }]} onPress={pickVideoFromGallery} disabled={saving || isPreparingVideos}>
              <Text style={styles.compactButtonIcon}>📼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.layoutSection}>
            <Text style={[styles.layoutSectionTitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('entry_layout_selector')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.layoutScroll}>
              <TouchableOpacity
                style={[
                  styles.layoutCompactButton,
                  { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' },
                  layout === 'grid' && [styles.layoutCompactButtonActive, { backgroundColor: isDark ? '#0B1220' : '#e3f2fd', borderColor: theme.colors.primary }],
                ]}
                onPress={() => setLayout('grid')}
              >
                <Text style={styles.layoutCompactIcon}>⊞</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layoutCompactButton,
                  { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' },
                  layout === 'masonry' && [styles.layoutCompactButtonActive, { backgroundColor: isDark ? '#0B1220' : '#e3f2fd', borderColor: theme.colors.primary }],
                ]}
                onPress={() => setLayout('masonry')}
              >
                <Text style={styles.layoutCompactIcon}>⊟</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layoutCompactButton,
                  { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' },
                  layout === 'magazine' && [styles.layoutCompactButtonActive, { backgroundColor: isDark ? '#0B1220' : '#e3f2fd', borderColor: theme.colors.primary }],
                ]}
                onPress={() => setLayout('magazine')}
              >
                <Text style={styles.layoutCompactIcon}>🗞️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layoutCompactButton,
                  { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' },
                  layout === 'full' && [styles.layoutCompactButtonActive, { backgroundColor: isDark ? '#0B1220' : '#e3f2fd', borderColor: theme.colors.primary }],
                ]}
                onPress={() => setLayout('full')}
              >
                <Text style={styles.layoutCompactIcon}>▭</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layoutCompactButton,
                  { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' },
                  layout === 'framed' && [styles.layoutCompactButtonActive, { backgroundColor: isDark ? '#0B1220' : '#e3f2fd', borderColor: theme.colors.primary }],
                ]}
                onPress={() => setLayout('framed')}
              >
                <Text style={styles.layoutCompactIcon}>🖼️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layoutCompactButton,
                  { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' },
                  layout === 'overlay' && [styles.layoutCompactButtonActive, { backgroundColor: isDark ? '#0B1220' : '#e3f2fd', borderColor: theme.colors.primary }],
                ]}
                onPress={() => setLayout('overlay')}
              >
                <Text style={styles.layoutCompactIcon}>🎭</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Selected Images Thumbnails */}
          {selectedImages.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
              <View style={styles.thumbnailContainer}>
                {selectedImages.map((uri, index) => (
                  <View key={index} style={styles.thumbnailWrapper}>
                    <Image source={{ uri }} style={styles.thumbnailImage} />
                    <TouchableOpacity
                      style={styles.removeThumbnailButton}
                      onPress={() => removeSelectedImage(uri)}
                    >
                      <Text style={styles.removeThumbnailText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Selected Videos Thumbnails */}
          {selectedVideos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
              <View style={styles.thumbnailContainer}>
                {selectedVideos.map((uri, index) => (
                  <View key={index} style={styles.thumbnailWrapper}>
                    {selectedVideoThumbnails[uri] ? (
                      <Image source={{ uri: selectedVideoThumbnails[uri] }} style={styles.thumbnailVideoImage} />
                    ) : (
                      <View style={styles.thumbnailVideoPlaceholder}>
                        <Text style={styles.thumbnailVideoIcon}>🎥</Text>
                        <Text style={styles.thumbnailVideoLabel} numberOfLines={1}>
                          {index + 1}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.removeThumbnailButton}
                      onPress={() => removeSelectedVideo(uri)}
                    >
                      <Text style={styles.removeThumbnailText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Location - Inline */}
          {location ? (
            <View style={previewStyles.locationContainer}>
              <Text style={previewStyles.locationIcon}>📍</Text>
              <Text style={previewStyles.locationText}>
                {location.address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
              </Text>
              <TouchableOpacity onPress={() => setLocation(null)}>
                <Text style={styles.removeLocationButton}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.addLocationButton, { backgroundColor: isDark ? '#1E293B' : '#f0f0f0' }]}
              onPress={getLocation}
              disabled={loadingLocation}
            >
              <Text style={styles.addLocationIcon}>📍</Text>
              <Text style={[styles.addLocationText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                {loadingLocation ? t('entry_location_loading') : t('entry_add_location')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Footer Stats */}
          <View style={previewStyles.entryFooter}>
            <Text style={previewStyles.footerHint}>
              {t('new_entry_layout_hint')}
            </Text>
            {selectedImages.length > 0 && (
              <View style={previewStyles.stat}>
                <Text style={previewStyles.statIcon}>📷</Text>
                <Text style={previewStyles.statText}>{selectedImages.length}</Text>
              </View>
            )}
            {selectedVideos.length > 0 && (
              <View style={previewStyles.stat}>
                <Text style={previewStyles.statIcon}>🎥</Text>
                <Text style={previewStyles.statText}>{selectedVideos.length}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666',
  },
  saveButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  imageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  compactButton: {
    width: 48,
    height: 48,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactButtonIcon: {
    fontSize: 24,
  },
  buttonDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 8,
  },
  layoutSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  layoutSectionTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  layoutScroll: {
    flex: 1,
  },
  layoutCompactButton: {
    width: 44,
    height: 44,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  layoutCompactButtonActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  layoutCompactIcon: {
    fontSize: 20,
  },
  thumbnailScroll: {
    marginTop: 12,
    marginBottom: 12,
  },
  thumbnailContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  thumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  thumbnailVideoImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  thumbnailVideoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.gray900,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  thumbnailVideoIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  thumbnailVideoLabel: {
    fontSize: 11,
    color: colors.white,
    fontWeight: '700',
  },
  removeThumbnailButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF3B30',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeThumbnailText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  addLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 12,
  },
  addLocationIcon: {
    fontSize: 18,
  },
  addLocationText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  removeLocationButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
    paddingHorizontal: 8,
  },
  dateSection: {
    marginBottom: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  dateButtonText: {
    fontSize: 24,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },

});

const previewStyles = StyleSheet.create({
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dateContainer: {
    width: 60,
    height: 60,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  dayNumber: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  monthText: {
    fontSize: typography.fontSizes.xs,
    color: colors.white,
    textTransform: 'uppercase',
  },
  entryHeaderContent: {
    flex: 1,
  },
  entryDate: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  entryTime: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  titleInput: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  contentInput: {
    fontSize: typography.fontSizes.md,
    lineHeight: 22,
    color: colors.text,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    minHeight: 120,
  },
  entryContent: {
    fontSize: typography.fontSizes.md,
    lineHeight: 22,
    color: colors.text,
    marginBottom: spacing.md,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  footerHint: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  locationIcon: {
    fontSize: 14,
  },
  locationText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  entryStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 14,
  },
  statText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  videoContainer: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  videoCard: {
    width: '100%',
    minHeight: 88,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoIconBadge: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  videoIconText: {
    fontSize: 22,
  },
  videoInfo: {
    flex: 1,
  },
  videoThumbnail: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    marginRight: spacing.md,
  },
  videoTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 4,
  },
  videoMeta: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },

  // Grid Layout
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  gridImage: {
    width: '48.5%',
    height: 130,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },

  // Masonry Layout
  masonryContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  masonryColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  masonryImage: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.md,
  },

  // Magazine Layout
  magazineContainer: {
    marginBottom: spacing.md,
  },
  magazineSingleImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  magazineMainImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  magazineThumbnails: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  magazineThumbnail: {
    flex: 1,
    height: 100,
    borderRadius: borderRadius.md,
  },

  // Full Layout
  fullContainer: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  fullImage: {
    width: '100%',
    height: 250,
    borderRadius: borderRadius.lg,
  },

  // Framed Layout
  framedContainer: {
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  framedImageWrapper: {
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  framedImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
  },

  // Overlay Layout
  overlayContainer: {
    height: 300,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  overlayBackground: {
    width: '100%',
    height: '100%',
  },
  overlayDark: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  overlayTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginBottom: spacing.sm,
  },
  overlayContent: {
    fontSize: typography.fontSizes.md,
    color: colors.white,
    lineHeight: 22,
  },
});
