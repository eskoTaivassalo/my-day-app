import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import ViewShot from 'react-native-view-shot';
import { Video,ResizeMode } from 'expo-av';
import { DiaryEntry } from '../types/DiaryEntry';
import { updateEntry, deleteEntry, uploadImages, uploadVideos } from '../services/diaryService';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, borderRadius, typography, shadows } from '../theme/theme';

const { width } = Dimensions.get('window');

type LayoutType = 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';

interface Props {
  navigation: any;
  route: {
    params: {
      entry: any; // Serialized entry with date strings
    };
  };
}

export default function EntryDetailScreen({ navigation, route }: Props) {
  const { entry: serializedEntry } = route.params;
  const { user } = useAuth();
  
  // Konvertoi Date-stringit takaisin Date-objekteiksi
  const normalizedEntry: DiaryEntry = {
    ...serializedEntry,
    date: new Date(serializedEntry.date),
    createdAt: new Date(serializedEntry.createdAt),
    updatedAt: new Date(serializedEntry.updatedAt),
  };

  const [entry, setEntry] = useState<DiaryEntry>(normalizedEntry);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(entry.title);
  const [editedContent, setEditedContent] = useState(entry.content);
  const [editedImages, setEditedImages] = useState<string[]>(entry.images);
  const [editedVideos, setEditedVideos] = useState<string[]>(entry.videos || []);
  const [editedDate, setEditedDate] = useState(entry.date);
  const [editedLocation, setEditedLocation] = useState(entry.location || null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layout, setLayout] = useState<LayoutType>(entry.layout || 'grid');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showLayoutSelector, setShowLayoutSelector] = useState(false);
  const [tempLayout, setTempLayout] = useState<LayoutType>(entry.layout || 'grid');
  const viewShotRef = useRef<ViewShot>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fi-FI', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('fi-FI', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

      try {
        const [addressData] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const address = addressData
          ? `${addressData.city || ''}, ${addressData.country || ''}`.trim().replace(/^,\s*/, '')
          : undefined;
        
        setEditedLocation({ latitude, longitude, address });
        Alert.alert('Sijainti lisätty', address || 'Sijainti tallennettu');
      } catch {
        setEditedLocation({ latitude, longitude });
        Alert.alert('Sijainti lisätty', 'Sijainti tallennettu');
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Virhe', 'Sijainnin hakeminen epäonnistui');
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!editedTitle.trim() || !editedContent.trim()) {
      Alert.alert('Virhe', 'Otsikko ja sisältö eivät voi olla tyhjiä');
      return;
    }

    setSaving(true);
    try {
      await updateEntry(entry.id, {
        title: editedTitle.trim(),
        content: editedContent.trim(),
        images: editedImages,
        videos: editedVideos,
        layout: layout,
        date: editedDate,
        ...(editedLocation && { location: editedLocation }),
      });

      setEntry({
        ...entry,
        title: editedTitle.trim(),
        content: editedContent.trim(),
        images: editedImages,
        videos: editedVideos,
        layout: layout,
        date: editedDate,
        location: editedLocation || undefined,
      });
      
      setIsEditing(false);
      Alert.alert('Tallennettu', 'Muutokset on tallennettu');
    } catch (error) {
      console.error('Error saving entry:', error);
      Alert.alert('Virhe', 'Tallentaminen epäonnistui');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedTitle(entry.title);
    setEditedContent(entry.content);
    setEditedImages(entry.images);
    setEditedVideos(entry.videos || []);
    setEditedDate(entry.date);
    setEditedLocation(entry.location || null);
    setIsEditing(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Poista merkintä',
      'Haluatko varmasti poistaa tämän merkinnän?',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Poista',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntry(entry.id);
              Alert.alert('Poistettu', 'Merkintä poistettu', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (error) {
              Alert.alert('Virhe', 'Poistaminen epäonnistui');
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    try {
      if (!viewShotRef.current) {
        Alert.alert('Virhe', 'Kuvakaappauksen ottaminen epäonnistui');
        return;
      }

      if (!viewShotRef.current?.capture) {
        Alert.alert('Virhe', 'Kuvakaappauksen ottaminen epäonnistui');
        return;
      }

      // Vieritä sisältö alkuun ennen kuvakaappauksen ottamista
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
        // Odota pidempi aika että scroll ja renderöinti valmistuu
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const uri = await viewShotRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        const result = await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
        });
        
        // Merkitse merkintä jaetuksi (shareAsync palauttaa aina, vaikka käyttäjä peruisi)
        if (user && !entry.shared) {
          console.log('Marking entry as shared:', entry.id);
          await updateEntry(entry.id, { shared: true });
          const updatedEntry = { ...entry, shared: true };
          setEntry(updatedEntry);
          console.log('Entry marked as shared successfully');
        }
      } else {
        Alert.alert('Virhe', 'Jakaminen ei ole tuettu tällä laitteella');
      }
    } catch (error) {
      console.error('Jakaminen epäonnistui:', error);
      Alert.alert('Virhe', 'Merkinnän jakaminen epäonnistui');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && user) {
      setSaving(true);
      try {
        const newImageUris = result.assets.map((asset) => asset.uri);
        const uploadedUrls = await uploadImages(newImageUris, user.uid);
        setEditedImages([...editedImages, ...uploadedUrls]);
      } catch (error) {
        Alert.alert('Virhe', 'Kuvien lataus epäonnistui');
      } finally {
        setSaving(false);
      }
    }
  };

  const removeImage = (uri: string) => {
    setEditedImages(editedImages.filter((img) => img !== uri));
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets && user) {
      setSaving(true);
      try {
        const newVideoUris = result.assets.map((asset) => asset.uri);
        const uploadedUrls = await uploadVideos(newVideoUris, user.uid);
        setEditedVideos([...editedVideos, ...uploadedUrls]);
      } catch (error) {
        Alert.alert('Virhe', 'Videoiden lataus epäonnistui');
      } finally {
        setSaving(false);
      }
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Lupa tarvitaan', 'Kameran käyttöoikeus tarvitaan videon tallentamiseen.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
      videoMaxDuration: 120,
    });

    if (!result.canceled && result.assets && user) {
      setSaving(true);
      try {
        const uploadedUrls = await uploadVideos([result.assets[0].uri], user.uid);
        setEditedVideos([...editedVideos, ...uploadedUrls]);
      } catch (error) {
        Alert.alert('Virhe', 'Videon lataus epäonnistui');
      } finally {
        setSaving(false);
      }
    }
  };

  const removeVideo = (uri: string) => {
    setEditedVideos(editedVideos.filter((video) => video !== uri));
  };
  const handleImagePress = (uri: string) => {
    if (!isEditing) {
      setSelectedImage(uri);
    }
  };

  const handleShareImage = async () => {
    if (!selectedImage) return;
    
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Virhe', 'Jakaminen ei ole tuettu tällä laitteella');
        return;
      }

      // Lataa kuva paikallisesti ensin
      const timestamp = Date.now();
      const localUri = `${FileSystem.cacheDirectory}shared_image_${timestamp}.jpg`;
      
      const downloadResult = await FileSystem.downloadAsync(selectedImage, localUri);
      
      if (downloadResult.uri) {
        const result = await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'image/jpeg',
        });
        
        // Merkitse merkintä jaetuksi
        if (user && !entry.shared) {
          console.log('Marking entry as shared (image):', entry.id);
          await updateEntry(entry.id, { shared: true });
          const updatedEntry = { ...entry, shared: true };
          setEntry(updatedEntry);
          console.log('Entry marked as shared successfully (image)');
        }
      } else {
        Alert.alert('Virhe', 'Kuvan lataaminen epäonnistui');
      }
    } catch (error) {
      console.error('Jakaminen epäonnistui:', error);
      Alert.alert('Virhe', 'Jakaminen epäonnistui');
    }
  };
  const renderImages = () => {
    const images = isEditing ? editedImages : entry.images;
    if (images.length === 0) return null;

    switch (layout) {
      case 'grid':
        return (
          <View style={styles.gridContainer}>
            {images.map((uri, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.gridImageWrapper}
                onPress={() => handleImagePress(uri)}
                activeOpacity={0.9}
              >
                <Image source={{ uri }} style={styles.gridImage} resizeMode="cover" />
                {isEditing && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(uri)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'masonry':
        // Vaihtelevat korkeudet masonry-layoutille
        const heights = [180, 240, 200, 260, 190, 220, 210, 250];
        return (
          <View style={styles.masonryContainer}>
            <View style={styles.masonryColumn}>
              {images.filter((_, i) => i % 2 === 0).map((uri, index) => {
                const actualIndex = index * 2;
                const height = heights[actualIndex % heights.length];
                return (
                  <TouchableOpacity 
                    key={actualIndex} 
                    style={[styles.masonryImageWrapper, { height }]}
                    onPress={() => handleImagePress(uri)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri }} style={styles.masonryImage} resizeMode="cover" />
                    {isEditing && (
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeImage(uri)}
                      >
                        <Text style={styles.removeImageText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.masonryColumn}>
              {images.filter((_, i) => i % 2 === 1).map((uri, index) => {
                const actualIndex = index * 2 + 1;
                const height = heights[actualIndex % heights.length];
                return (
                  <TouchableOpacity 
                    key={actualIndex} 
                    style={[styles.masonryImageWrapper, { height }]}
                    onPress={() => handleImagePress(uri)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri }} style={styles.masonryImage} resizeMode="cover" />
                    {isEditing && (
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeImage(uri)}
                      >
                        <Text style={styles.removeImageText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 'magazine':
        return (
          <View style={styles.magazineContainer}>
            {images[0] && (
              <TouchableOpacity 
                style={styles.magazineLargeWrapper}
                onPress={() => handleImagePress(images[0])}
                activeOpacity={0.9}
              >
                <Image source={{ uri: images[0] }} style={styles.magazineLarge} resizeMode="cover" />
                {isEditing && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(images[0])}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            {images.length > 1 && (
              <View style={styles.magazineSmallRow}>
                {images.slice(1).map((uri, index) => (
                  <TouchableOpacity 
                    key={index + 1} 
                    style={styles.magazineSmallWrapper}
                    onPress={() => handleImagePress(uri)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri }} style={styles.magazineSmall} resizeMode="cover" />
                    {isEditing && (
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeImage(uri)}
                      >
                        <Text style={styles.removeImageText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );

      case 'full':
        return (
          <View style={styles.fullContainer}>
            {images.map((uri, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.fullImageWrapper}
                onPress={() => handleImagePress(uri)}
                activeOpacity={0.9}
              >
                <Image source={{ uri }} style={styles.fullImage} resizeMode="cover" />
                {isEditing && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(uri)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'framed':
        return (
          <View style={styles.framedContainer}>
            {images.map((uri, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.framedImageWrapper}
                onPress={() => handleImagePress(uri)}
                activeOpacity={0.9}
              >
                <View style={styles.woodFrame}>
                  <Image source={{ uri }} style={styles.framedImage} resizeMode="cover" />
                </View>
                {isEditing && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(uri)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'overlay':
        return (
          <View style={styles.overlayContainer}>
            {images[0] && (
              <TouchableOpacity 
                style={styles.overlayImageWrapper}
                onPress={() => handleImagePress(images[0])}
                activeOpacity={0.9}
                disabled={isEditing}
              >
                <Image source={{ uri: images[0] }} style={styles.overlayBackgroundImage} resizeMode="cover" />
                <View style={styles.overlayGradient} />
                
                {/* Näytä overlay-teksti vain kun EI muokata */}
                {!isEditing && (
                  <View style={styles.overlayTextContainer}>
                    <Text style={styles.overlayTitle}>{editedTitle || entry.title}</Text>
                    <Text style={styles.overlayContent} numberOfLines={6}>
                      {editedContent || entry.content}
                    </Text>
                  </View>
                )}

                {isEditing && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(images[0])}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            
            {images.length > 1 && (
              <View style={styles.overlayThumbnailRow}>
                {images.slice(1, 4).map((uri, index) => (
                  <TouchableOpacity 
                    key={index + 1}
                    style={styles.overlayThumbnail}
                    onPress={() => handleImagePress(uri)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri }} style={styles.overlayThumbnailImage} resizeMode={ResizeMode.COVER} />
                    {isEditing && (
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => removeImage(uri)}
                      >
                        <Text style={styles.removeImageText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  const renderVideos = () => {
    const videos = isEditing ? editedVideos : (entry.videos || []);
    if (videos.length === 0) return null;

    return (
      <View style={styles.videoSection}>
        {videos.map((uri, index) => (
          <View key={index} style={styles.videoWrapper}>
            <Video
              source={{ uri }}
              style={styles.videoPlayer}
              resizeMode={ResizeMode.COVER}
              useNativeControls
            />
            {isEditing && (
              <TouchableOpacity
                style={styles.removeVideoButton}
                onPress={() => removeVideo(uri)}
              >
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Takaisin</Text>
        </TouchableOpacity>
        
        <View style={styles.headerButtons}>
          {!isEditing ? (
            <>
              <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
                <Text style={styles.iconButtonText}>📤</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.iconButton} 
                onPress={() => {
                  setTempLayout(layout);
                  setShowLayoutSelector(true);
                }}
              >
                <Text style={styles.iconButtonText}>🎨</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => setIsEditing(true)}>
                <Text style={styles.iconButtonText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={handleDelete}>
                <Text style={styles.iconButtonText}>🗑️</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.textButton}
                onPress={handleCancel}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Peruuta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Tallennetaan...' : 'Tallenna'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Content */}
      <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.9 }} style={{ flex: 1 }}>
        <ScrollView 
          style={styles.scrollContent} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Date */}
          <TouchableOpacity 
            style={styles.dateSection}
            onPress={() => isEditing && setShowDatePicker(true)}
            disabled={!isEditing}
          >
            <Text style={styles.dateText}>{formatDate(isEditing ? editedDate : entry.date)}</Text>
            <Text style={styles.timeText}>
              {isEditing ? 'Napauta vaihtaaksesi päivää 📅' : formatTime(entry.date)}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={editedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) {
                  setEditedDate(date);
                }
              }}
              maximumDate={new Date()}
            />
          )}

          {/* Title - näytä myös overlay-moodissa muokkaus-tilassa */}
          {(layout !== 'overlay' || isEditing) && (
            isEditing ? (
              <TextInput
                style={styles.titleInput}
                value={editedTitle}
                onChangeText={setEditedTitle}
                placeholder="Otsikko"
                multiline
              />
            ) : (
              <Text style={styles.title}>{entry.title}</Text>
            )
          )}

          {/* Content - näytä myös overlay-moodissa muokkaus-tilassa */}
          {(layout !== 'overlay' || isEditing) && (
            isEditing ? (
              <TextInput
                style={styles.contentInput}
                value={editedContent}
                onChangeText={setEditedContent}
                placeholder="Sisältö"
                multiline
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.content}>{entry.content}</Text>
            )
          )}

          {/* Location */}
          {isEditing ? (
            editedLocation ? (
              <View style={styles.locationSection}>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={styles.locationText}>
                  {editedLocation.address || `${editedLocation.latitude.toFixed(4)}, ${editedLocation.longitude.toFixed(4)}`}
                </Text>
                <TouchableOpacity onPress={() => setEditedLocation(null)}>
                  <Text style={styles.removeLocationText}>×</Text>
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
            )
          ) : (
            entry.location && (
              <View style={styles.locationSection}>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={styles.locationText}>
                  {entry.location.address || `${entry.location.latitude.toFixed(4)}, ${entry.location.longitude.toFixed(4)}`}
                </Text>
              </View>
            )
          )}

          {/* Images */}
          {renderImages()}

          {/* Videos */}
          {renderVideos()}

          {/* Add Image Button */}
          {isEditing && (
            <View style={styles.mediaButtonsRow}>
              <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
                <Text style={styles.addImageText}>+ Lisää kuvia</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addVideoButton} onPress={pickVideo}>
                <Text style={styles.addVideoText}>+ Lisää videoita</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addVideoButton} onPress={recordVideo}>
                <Text style={styles.addVideoText}>🎥 Kuvaa video</Text>
              </TouchableOpacity>
            </View>
          )}

        {/* Metadata */}
        <View style={styles.metadata}>
          <Text style={styles.metadataText}>
            Luotu: {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
          </Text>
          <Text style={styles.metadataText}>
            Muokattu: {formatDate(entry.updatedAt)} {formatTime(entry.updatedAt)}
          </Text>
        </View>
      </ScrollView>
      </ViewShot>

      {/* Image Modal */}
      <Modal
        visible={selectedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalContainer}>
          <Pressable 
            style={styles.modalBackdrop}
            onPress={() => setSelectedImage(null)}
          />
          
          {selectedImage && (
            <>
              <Image 
                source={{ uri: selectedImage }} 
                style={styles.modalImage}
                resizeMode="contain"
              />
              
              {/* Floating toolbar */}
              <View style={styles.modalToolbar}>
                <TouchableOpacity 
                  style={styles.toolbarButton}
                  onPress={handleShareImage}
                >
                  <Text style={styles.toolbarButtonText}>📤 Jaa</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.toolbarButton, styles.closeButton]}
                  onPress={() => setSelectedImage(null)}
                >
                  <Text style={styles.toolbarButtonText}>✕ Sulje</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Layout Selector Modal */}
      <Modal
        visible={showLayoutSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLayoutSelector(false)}
      >
        <View style={styles.layoutModalContainer}>
          <View style={styles.layoutModalContent}>
            <Text style={styles.layoutModalTitle}>Valitse asettelu</Text>
            
            <View style={styles.layoutOptionsContainer}>
              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'grid' && styles.layoutOptionSelected]}
                onPress={() => setTempLayout('grid')}
              >
                <Text style={styles.layoutOptionIcon}>⊞</Text>
                <Text style={styles.layoutOptionText}>Ruudukko</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'masonry' && styles.layoutOptionSelected]}
                onPress={() => setTempLayout('masonry')}
              >
                <Text style={styles.layoutOptionIcon}>⊟</Text>
                <Text style={styles.layoutOptionText}>Masonry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'magazine' && styles.layoutOptionSelected]}
                onPress={() => setTempLayout('magazine')}
              >
                <Text style={styles.layoutOptionIcon}>🗞️</Text>
                <Text style={styles.layoutOptionText}>Lehti</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'full' && styles.layoutOptionSelected]}
                onPress={() => setTempLayout('full')}
              >
                <Text style={styles.layoutOptionIcon}>▭</Text>
                <Text style={styles.layoutOptionText}>Täysi</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'framed' && styles.layoutOptionSelected]}
                onPress={() => setTempLayout('framed')}
              >
                <Text style={styles.layoutOptionIcon}>🖼️</Text>
                <Text style={styles.layoutOptionText}>Kehykset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'overlay' && styles.layoutOptionSelected]}
                onPress={() => setTempLayout('overlay')}
              >
                <Text style={styles.layoutOptionIcon}>🎭</Text>
                <Text style={styles.layoutOptionText}>Overlay</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.layoutModalButtons}>
              <TouchableOpacity
                style={styles.layoutModalCancelButton}
                onPress={() => setShowLayoutSelector(false)}
              >
                <Text style={styles.layoutModalCancelText}>Peruuta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.layoutModalApplyButton}
                onPress={async () => {
                  setLayout(tempLayout);
                  setShowLayoutSelector(false);
                  
                  // Tallenna layout Firestoreen
                  try {
                    await updateEntry(entry.id, { layout: tempLayout });
                    setEntry({ ...entry, layout: tempLayout });
                  } catch (error) {
                    console.error('Error saving layout:', error);
                    Alert.alert('Virhe', 'Asettelun tallentaminen epäonnistui');
                  }
                }}
              >
                <Text style={styles.layoutModalApplyText}>Käytä tätä asettelua</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: 20,
  },
  textButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
  },
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  saveButtonText: {
    fontSize: typography.fontSizes.md,
    color: colors.white,
    fontWeight: typography.fontWeights.semibold,
  },
  scrollContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  dateSection: {
    marginBottom: spacing.lg,
  },
  dateText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textTransform: 'capitalize',
  },
  timeText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  locationIcon: {
    fontSize: 20,
  },
  locationText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    flex: 1,
  },
  removeLocationText: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: '300',
    paddingHorizontal: spacing.sm,
  },
  addLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.gray200,
  },
  addLocationIcon: {
    fontSize: 20,
  },
  addLocationText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.medium,
  },
  titleInput: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  
  // Grid Layout
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  gridImageWrapper: {
    position: 'relative',
    width: (width - spacing.lg * 2 - spacing.sm) / 2,
    height: 200,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },

  // Masonry Layout  
  masonryContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  masonryColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  masonryImageWrapper: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  masonryImage: {
    width: '100%',
    height: '100%',
  },

  // Magazine Layout
  magazineContainer: {
    marginBottom: spacing.lg,
  },
  magazineLargeWrapper: {
    position: 'relative',
    height: 400,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  magazineLarge: {
    width: '100%',
    height: '100%',
  },
  magazineSmallRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  magazineSmallWrapper: {
    position: 'relative',
    flex: 1,
    height: 120,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  magazineSmall: {
    width: '100%',
    height: '100%',
  },

  // Full Width Layout
  fullContainer: {
    marginBottom: spacing.lg,
  },
  fullImageWrapper: {
    position: 'relative',
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  fullImage: {
    width: '100%',
    height: 300,
  },

  // Framed Layout (puukehykset)
  framedContainer: {
    marginBottom: spacing.lg,
  },
  framedImageWrapper: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  woodFrame: {
    padding: 16,
    backgroundColor: '#8B4513',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#654321',
    position: 'relative',
  },
  framedImage: {
    width: width - spacing.lg * 4 - 32,
    height: 350,
    borderWidth: 2,
    borderColor: '#DEB887',
  },

  // Overlay Layout (teksti kuvan päällä)
  overlayContainer: {
    marginBottom: spacing.lg,
  },
  overlayImageWrapper: {
    position: 'relative',
    height: 500,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  overlayBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  overlayGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  overlayTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
  },
  overlayTitle: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginBottom: spacing.md,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  overlayContent: {
    fontSize: typography.fontSizes.lg,
    lineHeight: 28,
    color: colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  overlayTitleInput: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  overlayContentInput: {
    fontSize: typography.fontSizes.lg,
    lineHeight: 28,
    color: colors.white,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    minHeight: 120,
  },
  overlayThumbnailRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  overlayThumbnail: {
    position: 'relative',
    flex: 1,
    height: 100,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  overlayThumbnailImage: {
    width: '100%',
    height: '100%',
  },

  removeImageButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: typography.fontWeights.bold,
  },
  addImageButton: {
    padding: spacing.lg,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.gray200,
    alignItems: 'center',
  },
  addImageText: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  mediaButtonsRow: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  addVideoButton: {
    padding: spacing.lg,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.gray200,
    alignItems: 'center',
  },
  addVideoText: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  videoSection: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  videoWrapper: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  removeVideoButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    fontSize: typography.fontSizes.lg,
    lineHeight: 28,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  contentInput: {
    fontSize: typography.fontSizes.lg,
    lineHeight: 28,
    color: colors.text,
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    minHeight: 200,
  },
  metadata: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  metadataText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalImage: {
    width: '90%',
    height: '70%',
  },
  modalToolbar: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    ...shadows.lg,
  },
  toolbarButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    minWidth: 100,
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: colors.gray300,
  },
  toolbarButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.white,
  },
  
  // Layout Selector Modal
  layoutModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  layoutModalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xl + 20,
  },
  layoutModalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  layoutOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  layoutOption: {
    width: (width - spacing.xl * 2 - spacing.md * 2) / 3,
    aspectRatio: 1,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  layoutOptionSelected: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  layoutOptionIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  layoutOptionText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  layoutModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  layoutModalCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray200,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  layoutModalCancelText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
  },
  layoutModalApplyButton: {
    flex: 2,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  layoutModalApplyText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
});
