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
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { PhotoAsset } from '../types/DiaryEntry';
import { useAuth } from '../contexts/AuthContext';
import { createEntry, uploadImages } from '../services/diaryService';

export default function NewEntryScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<PhotoAsset[]>([]);
  const [hasMediaPermission, setHasMediaPermission] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
    setHasMediaPermission(mediaStatus === 'granted');

    if (mediaStatus === 'granted') {
      loadRecentPhotos();
    }
  };

  const loadRecentPhotos = async () => {
    try {
      // Get recent photos from device (last 20)
      const albums = await MediaLibrary.getAlbumsAsync();
      
      if (albums.length > 0) {
        const recentAlbum = await MediaLibrary.getAssetsAsync({
          first: 20,
          sortBy: [MediaLibrary.SortBy.creationTime],
          mediaType: MediaLibrary.MediaType.photo,
        });

        const photos: PhotoAsset[] = recentAlbum.assets.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          creationTime: asset.creationTime,
        }));

        setRecentPhotos(photos);
      }
    } catch (error) {
      console.error('Error loading recent photos:', error);
    }
  };

  const pickImageFromGallery = async () => {
    console.log('pickImageFromGallery called');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    console.log('Gallery picker result:', JSON.stringify(result, null, 2));
    console.log('Result canceled?', result.canceled);
    console.log('Result has assets?', result.assets ? 'yes' : 'no');

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map((asset) => asset.uri);
      console.log('New images from gallery:', newImages);
      console.log('Current selectedImages before:', selectedImages);
      setSelectedImages([...selectedImages, ...newImages]);
      console.log('Current selectedImages after:', [...selectedImages, ...newImages]);
    } else {
      console.log('Gallery selection was canceled or no assets');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Lupa tarvitaan', 'Kameran käyttöoikeus tarvitaan kuvan ottamiseen.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets) {
      setSelectedImages([...selectedImages, result.assets[0].uri]);
    }
  };

  const toggleRecentPhoto = (uri: string) => {
    console.log('toggleRecentPhoto called with:', uri);
    console.log('Current selectedImages:', selectedImages);
    if (selectedImages.includes(uri)) {
      setSelectedImages(selectedImages.filter((img) => img !== uri));
    } else {
      setSelectedImages([...selectedImages, uri]);
      console.log('Added to selectedImages, new array:', [...selectedImages, uri]);
    }
  };

  const removeSelectedImage = (uri: string) => {
    setSelectedImages(selectedImages.filter((img) => img !== uri));
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
      console.log('Saving entry with images:', selectedImages);
      if (selectedImages.length > 0) {
        console.log('Uploading images to Firebase Storage...');
        imageUrls = await uploadImages(selectedImages, user.uid);
        console.log('Image URLs from Firebase:', imageUrls);
      }

      // Save entry to Firestore
      await createEntry(
        {
          title: title.trim(),
          content: content.trim(),
          images: imageUrls,
          date: new Date(),
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
            {saving ? 'Tallennetaan...' : 'Tallenna'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Title Input */}
        <TextInput
          style={styles.titleInput}
          placeholder="Otsikko..."
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        {/* Content Input */}
        <TextInput
          style={styles.contentInput}
          placeholder="Mitä tänään tapahtui?"
          placeholderTextColor="#999"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        {/* Selected Images */}
        {selectedImages.length > 0 && (
          <View style={styles.selectedImagesSection}>
            <Text style={styles.sectionTitle}>Valitut kuvat ({selectedImages.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.selectedImagesContainer}>
                {selectedImages.map((uri, index) => (
                  <View key={index} style={styles.selectedImageWrapper}>
                    <Image source={{ uri }} style={styles.selectedImage} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeSelectedImage(uri)}
                    >
                      <Text style={styles.removeImageText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Image Actions */}
        <View style={styles.imageActions}>
          <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
            <Text style={styles.actionButtonIcon}>📷</Text>
            <Text style={styles.actionButtonText}>Ota kuva</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={pickImageFromGallery}>
            <Text style={styles.actionButtonIcon}>🖼️</Text>
            <Text style={styles.actionButtonText}>Valitse galleriasta</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Photos Suggestions */}
        {hasMediaPermission && recentPhotos.length > 0 && (
          <View style={styles.recentPhotosSection}>
            <Text style={styles.sectionTitle}>Viimeisimmät kuvat</Text>
            <Text style={styles.sectionSubtitle}>
              Napauta lisätäksesi kuvia merkintään
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.recentPhotosContainer}>
                {recentPhotos.map((photo, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => toggleRecentPhoto(photo.uri)}
                    style={[
                      styles.recentPhotoWrapper,
                      selectedImages.includes(photo.uri) && styles.recentPhotoSelected,
                    ]}
                  >
                    <Image source={{ uri: photo.uri }} style={styles.recentPhoto} />
                    {selectedImages.includes(photo.uri) && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {!hasMediaPermission && (
          <View style={styles.permissionMessage}>
            <Text style={styles.permissionText}>
              Anna lupa kuvagalleriaan nähdäksesi kuvasuositukset
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermissions}
            >
              <Text style={styles.permissionButtonText}>Anna lupa</Text>
            </TouchableOpacity>
          </View>
        )}
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
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    padding: 8,
  },
  contentInput: {
    fontSize: 16,
    color: '#333',
    minHeight: 200,
    padding: 8,
    lineHeight: 24,
  },
  selectedImagesSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  selectedImagesContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  selectedImageWrapper: {
    position: 'relative',
  },
  selectedImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  removeImageText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  imageActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonIcon: {
    fontSize: 24,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  recentPhotosSection: {
    marginBottom: 24,
  },
  recentPhotosContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  recentPhotoWrapper: {
    position: 'relative',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recentPhotoSelected: {
    borderColor: '#007AFF',
  },
  recentPhoto: {
    width: 100,
    height: 100,
    borderRadius: 6,
  },
  selectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#007AFF',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  permissionMessage: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginBottom: 24,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
