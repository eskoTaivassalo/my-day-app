import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Video, ResizeMode } from 'expo-av';
import { useAuth } from '../contexts/AuthContext';
import { createEntry, uploadImages, uploadVideo, uploadVideos } from '../services/diaryService';
import { colors, spacing, borderRadius, typography } from '../theme/theme';

type LayoutType = 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';

export default function NewEntryScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [layout, setLayout] = useState<LayoutType>('grid');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address?: string } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const { user } = useAuth();

  const getLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Lupa tarvitaan', 'Sijainnin käyttöoikeus tarvitaan paikan lisäämiseen.');
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
        Alert.alert('Sijainti lisätty', address || 'Sijainti tallennettu');
      } catch {
        setLocation({ latitude, longitude });
        Alert.alert('Sijainti lisätty', 'Sijainti tallennettu');
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Virhe', 'Sijainnin hakeminen epäonnistui');
    } finally {
      setLoadingLocation(false);
    }
  };

  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map((asset) => asset.uri);
      setSelectedImages([...selectedImages, ...newImages]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Lupa tarvitaan', 'Kameran käyttöoikeus tarvitaan kuvan ottamiseen.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets) {
      setSelectedImages([...selectedImages, result.assets[0].uri]);
    }
  };

  const removeSelectedImage = (uri: string) => {
    setSelectedImages(selectedImages.filter((img) => img !== uri));
  };

  const pickVideoFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets) {
      const newVideos = result.assets.map((asset) => asset.uri);
      setSelectedVideos([...selectedVideos, ...newVideos]);
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Lupa tarvitaan', 'Kameran käyttöoikeus tarvitaan videon tallentamiseen.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'videos',
      quality: 1,
      videoMaxDuration: 120,
    });

    if (!result.canceled && result.assets) {
      setSelectedVideos([...selectedVideos, result.assets[0].uri]);
    }
  };

  const removeSelectedVideo = (uri: string) => {
    setSelectedVideos(selectedVideos.filter((video) => video !== uri));
  };

  const renderImages = () => {
    if (selectedImages.length === 0) return null;

    const imageWidth = 280;

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
                <Image source={{ uri }} style={previewStyles.framedImage} />
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
          <View key={index} style={previewStyles.videoWrapper}>
            <Video
              source={{ uri }}
              style={previewStyles.video}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              useNativeControls
            />
          </View>
        ))}
      </View>
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Puuttuva otsikko', 'Anna merkinnälle otsikko.');
      return;
    }

    if (!content.trim()) {
      Alert.alert('Puuttuva sisältö', 'Kirjoita jotain päiväkirjamerkintääsi.');
      return;
    }

    if (!user) {
      Alert.alert('Virhe', 'Sinun täytyy olla kirjautuneena tallentaaksesi merkinnän.');
      return;
    }

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
      if (selectedVideos.length > 0) {
        setUploadProgress(0);
        const videoUploadPromises = selectedVideos.map((uri, i) =>
          uploadVideo(uri, user.uid, (progress) => {
            // Approximate overall progress across all videos
            setUploadProgress(Math.round(
              ((i / selectedVideos.length) + progress / 100 / selectedVideos.length) * 100
            ));
          })
        );
        const videoAssets = await Promise.all(videoUploadPromises);
        videoUrls = videoAssets.map((asset) => asset.videoUrl);
        videoThumbnails = videoAssets.reduce((acc, asset) => {
          if (asset.thumbnailUrl) {
            acc[asset.videoUrl] = asset.thumbnailUrl;
          }
          return acc;
        }, {} as Record<string, string>);
        setUploadProgress(null);
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
      Alert.alert(
        'Tallennettu!',
        'Päiväkirjamerkintä on tallennettu.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error saving entry:', error);
      Alert.alert('Virhe', 'Merkinnän tallentaminen epäonnistui. Yritä uudelleen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButton}>Peruuta</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uusi merkintä</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
            {uploadProgress !== null
              ? `Ladataan... ${uploadProgress}%`
              : saving ? 'Tallennetaan...' : 'Tallenna'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* INTERACTIVE PREVIEW CARD */}
        <View style={styles.previewCard}>
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
                {selectedDate.toLocaleDateString('fi-FI', { month: 'short' })}
              </Text>
            </View>
            
            <View style={previewStyles.entryHeaderContent}>
              <Text style={previewStyles.entryDate}>
                {selectedDate.toLocaleDateString('fi-FI', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </Text>
              <Text style={previewStyles.entryTime}>
                Napauta vaihtaaksesi päivää 📅
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
            style={previewStyles.titleInput}
            placeholder="Anna merkinnälle otsikko..."
            placeholderTextColor="#999"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          {/* Content Input - Inline */}
          <TextInput
            style={previewStyles.contentInput}
            placeholder="Mitä tänään tapahtui? Kirjoita tähän..."
            placeholderTextColor="#999"
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
            <TouchableOpacity style={styles.compactButton} onPress={takePhoto}>
              <Text style={styles.compactButtonIcon}>📷</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.compactButton} onPress={pickImageFromGallery}>
              <Text style={styles.compactButtonIcon}>🖼️</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.compactButton} onPress={recordVideo}>
              <Text style={styles.compactButtonIcon}>🎥</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.compactButton} onPress={pickVideoFromGallery}>
              <Text style={styles.compactButtonIcon}>📼</Text>
            </TouchableOpacity>

            {selectedImages.length > 0 && (
              <>
                <View style={styles.buttonDivider} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.layoutScroll}>
                  <TouchableOpacity
                    style={[styles.layoutCompactButton, layout === 'grid' && styles.layoutCompactButtonActive]}
                    onPress={() => setLayout('grid')}
                  >
                    <Text style={styles.layoutCompactIcon}>⊞</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.layoutCompactButton, layout === 'masonry' && styles.layoutCompactButtonActive]}
                    onPress={() => setLayout('masonry')}
                  >
                    <Text style={styles.layoutCompactIcon}>⊟</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.layoutCompactButton, layout === 'magazine' && styles.layoutCompactButtonActive]}
                    onPress={() => setLayout('magazine')}
                  >
                    <Text style={styles.layoutCompactIcon}>🗞️</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.layoutCompactButton, layout === 'full' && styles.layoutCompactButtonActive]}
                    onPress={() => setLayout('full')}
                  >
                    <Text style={styles.layoutCompactIcon}>▭</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.layoutCompactButton, layout === 'framed' && styles.layoutCompactButtonActive]}
                    onPress={() => setLayout('framed')}
                  >
                    <Text style={styles.layoutCompactIcon}>🖼️</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.layoutCompactButton, layout === 'overlay' && styles.layoutCompactButtonActive]}
                    onPress={() => setLayout('overlay')}
                  >
                    <Text style={styles.layoutCompactIcon}>🎭</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
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
                    <Video
                      source={{ uri }}
                      style={styles.thumbnailVideo}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={false}
                    />
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
              style={styles.addLocationButton}
              onPress={getLocation}
              disabled={loadingLocation}
            >
              <Text style={styles.addLocationIcon}>📍</Text>
              <Text style={styles.addLocationText}>
                {loadingLocation ? 'Haetaan sijaintia...' : 'Lisää sijainti'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Footer Stats */}
          <View style={previewStyles.entryFooter}>
            <Text style={previewStyles.footerHint}>
              Näin merkintäsi näkyy aikajanalla
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
  thumbnailVideo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#000',
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
  videoWrapper: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  video: {
    width: '100%',
    height: '100%',
  },

  // Grid Layout
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  gridImage: {
    width: 130,
    height: 130,
    borderRadius: borderRadius.md,
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
