import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import ViewShot from 'react-native-view-shot';
import { DiaryEntry } from '../types/DiaryEntry';
import { updateEntry, deleteEntry, uploadImages } from '../services/diaryService';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

type LayoutType = 'grid' | 'masonry' | 'magazine';
type TextPosition = 'top' | 'middle' | 'bottom';
type ImageShape = 'square' | 'circle' | 'landscape';

interface Props {
  navigation: any;
  route: {
    params: {
      entry: DiaryEntry;
      onUpdate?: () => void;
    };
  };
}

export default function EntryDetailScreen({ navigation, route }: Props) {
  const { entry: initialEntry, onUpdate } = route.params;
  
  // Konvertoi Date-stringit takaisin Date-objekteiksi
  const normalizedEntry: DiaryEntry = {
    ...initialEntry,
    date: initialEntry.date instanceof Date ? initialEntry.date : new Date(initialEntry.date),
    createdAt: initialEntry.createdAt instanceof Date ? initialEntry.createdAt : new Date(initialEntry.createdAt),
    updatedAt: initialEntry.updatedAt instanceof Date ? initialEntry.updatedAt : new Date(initialEntry.updatedAt),
  };
  
  const [entry, setEntry] = useState<DiaryEntry>(normalizedEntry);
  const viewShotRef = React.useRef<ViewShot>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(entry.title);
  const [editedContent, setEditedContent] = useState(entry.content);
  const [editedImages, setEditedImages] = useState<string[]>(entry.images);
  const [layout, setLayout] = useState<LayoutType>(entry.layout || 'grid');
  const [textPosition, setTextPosition] = useState<TextPosition>(entry.textPosition || 'top');
  const [imageShape, setImageShape] = useState<ImageShape>(entry.imageShape || 'square');
  const [textOverlay, setTextOverlay] = useState(entry.textOverlay || false);
  const [saving, setSaving] = useState(false);
  const [layoutModalVisible, setLayoutModalVisible] = useState(false);
  const [tempLayout, setTempLayout] = useState<LayoutType>('grid');
  const [tempTextPosition, setTempTextPosition] = useState<TextPosition>('top');
  const [tempImageShape, setTempImageShape] = useState<ImageShape>('square');
  const [tempTextOverlay, setTempTextOverlay] = useState(false);
  const { user } = useAuth();

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fi-FI', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('fi-FI', {
      hour: '2-digit',
      minute: '2-digit',
    });
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
      });

      const updatedEntry = {
        ...entry,
        title: editedTitle.trim(),
        content: editedContent.trim(),
        images: editedImages,
      };

      setEntry(updatedEntry);
      setIsEditing(false);
      onUpdate?.();
      Alert.alert('Tallennettu', 'Muutokset on tallennettu');
    } catch (error) {
      console.error('Error saving entry:', error);
      Alert.alert('Virhe', 'Tallentaminen epäonnistui');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    try {
      if (!viewShotRef.current) {
        Alert.alert('Virhe', 'Kuvakaappauksen ottaminen epäonnistui');
        return;
      }

      // Ota kuvakaappaus koko merkinnästä
      const uri = await viewShotRef.current.capture();
      
      // Tarkista että jakaminen on mahdollista
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
        });
      } else {
        Alert.alert('Virhe', 'Jakaminen ei ole tuettu tällä laitteella');
      }
    } catch (error) {
      console.error('Jakaminen epäonnistui:', error);
      Alert.alert('Virhe', 'Merkinnän jakaminen epäonnistui');
    }
  };

  const saveLayoutSettings = async () => {
    try {
      await updateEntry(entry.id, {
        layout,
        textPosition,
        imageShape,
        textOverlay,
      });
      
      const updatedEntry = {
        ...entry,
        layout,
        textPosition,
        imageShape,
        textOverlay,
      };
      
      setEntry(updatedEntry);
      onUpdate?.();
    } catch (error) {
      console.error('Error saving layout settings:', error);
    }
  };

  const handleCancel = () => {
    setEditedTitle(entry.title);
    setEditedContent(entry.content);
    setEditedImages(entry.images);
    setIsEditing(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Poista merkintä',
      'Haluatko varmasti poistaa tämän merkinnän? Tätä toimintoa ei voi perua.',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Poista',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntry(entry.id);
              onUpdate?.();
              navigation.goBack();
              Alert.alert('Poistettu', 'Merkintä on poistettu');
            } catch (error) {
              Alert.alert('Virhe', 'Poistaminen epäonnistui');
            }
          },
        },
      ]
    );
  };

  const addImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && user) {
      try {
        const newImageUris = result.assets.map((asset) => asset.uri);
        const uploadedUrls = await uploadImages(newImageUris, user.uid);
        setEditedImages([...editedImages, ...uploadedUrls]);
      } catch (error) {
        Alert.alert('Virhe', 'Kuvien lataus epäonnistui');
      }
    }
  };

  const removeImage = (index: number) => {
    Alert.alert(
      'Poista kuva',
      'Haluatko varmasti poistaa tämän kuvan?',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Poista',
          style: 'destructive',
          onPress: () => {
            const newImages = editedImages.filter((_, i) => i !== index);
            setEditedImages(newImages);
          },
        },
      ]
    );
  };

  const renderImages = () => {
    const imagesToShow = isEditing ? editedImages : entry.images;
    
    console.log('Current layout:', layout);
    console.log('Text position:', textPosition);
    console.log('Image shape:', imageShape);
    console.log('Text overlay:', textOverlay);

    if (imagesToShow.length === 0) {
      return isEditing ? (
        <TouchableOpacity style={styles.addImageButton} onPress={addImage}>
          <Text style={styles.addImageIcon}>📷</Text>
          <Text style={styles.addImageText}>Lisää kuvia</Text>
        </TouchableOpacity>
      ) : null;
    }

    if (layout === 'grid') {
      return (
        <View style={styles.gridLayout}>
          {imagesToShow.map((uri, index) => (
            <View key={index} style={[
              styles.gridImageWrapper,
              imageShape === 'circle' && styles.circleImage,
              imageShape === 'landscape' && styles.landscapeImage,
            ]}>
              <Image source={{ uri }} style={styles.gridImage} />
              {isEditing && (
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Text style={styles.removeImageText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {isEditing && (
            <TouchableOpacity style={styles.gridAddButton} onPress={addImage}>
              <Text style={styles.gridAddIcon}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (layout === 'masonry') {
      return (
        <View style={styles.masonryLayout}>
          <View style={styles.masonryColumn}>
            {imagesToShow.filter((_, i) => i % 2 === 0).map((uri, index) => {
              const actualIndex = index * 2;
              return (
                <View key={actualIndex} style={[
                  styles.masonryImageWrapper,
                  imageShape === 'circle' && styles.circleImage,
                  imageShape === 'landscape' && styles.landscapeImage,
                ]}>
                  <Image
                    source={{ uri }}
                    style={[styles.masonryImage, { height: 150 + (actualIndex % 3) * 50 }]}
                  />
                  {isEditing && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(actualIndex)}
                    >
                      <Text style={styles.removeImageText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.masonryColumn}>
            {imagesToShow.filter((_, i) => i % 2 === 1).map((uri, index) => {
              const actualIndex = index * 2 + 1;
              return (
                <View key={actualIndex} style={[
                  styles.masonryImageWrapper,
                  imageShape === 'circle' && styles.circleImage,
                  imageShape === 'landscape' && styles.landscapeImage,
                ]}>
                  <Image
                    source={{ uri }}
                    style={[styles.masonryImage, { height: 180 + (actualIndex % 3) * 40 }]}
                  />
                  {isEditing && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(actualIndex)}
                    >
                      <Text style={styles.removeImageText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
          {isEditing && (
            <TouchableOpacity style={styles.masonryAddButton} onPress={addImage}>
              <Text style={styles.gridAddIcon}>+</Text>
              <Text style={styles.addImageText}>Lisää</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (layout === 'magazine') {
      return (
        <View style={styles.magazineLayout}>
          {imagesToShow.map((uri, index) => (
            <View
              key={index}
              style={[
                styles.magazineImageWrapper,
                index === 0 && styles.magazineHero,
                index > 0 && styles.magazineSmall,
                imageShape === 'circle' && styles.circleImage,
                imageShape === 'landscape' && styles.landscapeImage,
              ]}
            >
              <Image source={{ uri }} style={styles.magazineImage} />
              {isEditing && (
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Text style={styles.removeImageText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {isEditing && (
            <TouchableOpacity style={styles.magazineAddButton} onPress={addImage}>
              <Text style={styles.gridAddIcon}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return null;
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
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleShare}
              >
                <Text style={styles.iconButtonText}>📤</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => {
                  setTempLayout(layout);
                  setTempTextPosition(textPosition);
                  setTempImageShape(imageShape);
                  setTempTextOverlay(textOverlay);
                  setLayoutModalVisible(true);
                }}
              >
                <Text style={styles.iconButtonText}>🎨</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setIsEditing(true)}
              >
                <Text style={styles.iconButtonText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleDelete}
              >
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

      <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.9 }}>
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Text Overlay Mode */}
        {textOverlay && (
          <View style={styles.overlayContainer}>
            {/* Images as background */}
            {entry.images.length > 0 && (
              <Image 
                source={{ uri: entry.images[0] }} 
                style={styles.overlayBackgroundImage}
                blurRadius={2}
              />
            )}
            
            {/* Dark gradient overlay */}
            <View style={styles.overlayGradient} />
            
            {/* Text content on top */}
            <View style={styles.overlayTextContainer}>
              <View style={styles.dateHeader}>
                <View style={styles.dateBox}>
                  <Text style={[styles.dayNumber, { color: colors.white }]}>{new Date(entry.date).getDate()}</Text>
                  <Text style={[styles.monthYear, { color: colors.white }]}>
                    {new Date(entry.date).toLocaleDateString('fi-FI', { month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.dateInfo}>
                  <Text style={[styles.dateText, { color: colors.white }]}>{formatDate(entry.date)}</Text>
                  <Text style={[styles.timeText, { color: colors.white }]}>{formatTime(entry.date)}</Text>
                </View>
              </View>

              {isEditing ? (
                <TextInput
                  style={[styles.titleInput, { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                  value={editedTitle}
                  onChangeText={setEditedTitle}
                  placeholder="Otsikko"
                  placeholderTextColor={colors.textLight}
                />
              ) : (
                <Text style={[styles.title, { color: colors.white }]}>{entry.title}</Text>
              )}

              {isEditing ? (
                <TextInput
                  style={[styles.contentInput, { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                  value={editedContent}
                  onChangeText={setEditedContent}
                  placeholder="Sisältö"
                  placeholderTextColor={colors.textLight}
                  multiline
                  textAlignVertical="top"
                />
              ) : (
                <Text style={[styles.contentText, { color: colors.white }]}>{entry.content}</Text>
              )}
            </View>
            
            {/* Additional images below */}
            {entry.images.length > 1 && (
              <View style={styles.overlayAdditionalImages}>
                {renderImages()}
              </View>
            )}
          </View>
        )}

        {/* Normal Mode - Content Order based on textPosition */}
        {!textOverlay && textPosition === 'top' && (
          <>
            {/* Date Header */}
            <View style={styles.dateHeader}>
              <View style={styles.dateBox}>
                <Text style={styles.dayNumber}>{new Date(entry.date).getDate()}</Text>
                <Text style={styles.monthYear}>
                  {new Date(entry.date).toLocaleDateString('fi-FI', { month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <View style={styles.dateInfo}>
                <Text style={styles.dateText}>{formatDate(entry.date)}</Text>
                <Text style={styles.timeText}>{formatTime(entry.date)}</Text>
              </View>
            </View>

            {/* Title */}
            {isEditing ? (
              <TextInput
                style={styles.titleInput}
                value={editedTitle}
                onChangeText={setEditedTitle}
                placeholder="Otsikko"
                placeholderTextColor={colors.textLight}
              />
            ) : (
              <Text style={styles.title}>{entry.title}</Text>
            )}

            {/* Content */}
            {isEditing ? (
              <TextInput
                style={styles.contentInput}
                value={editedContent}
                onChangeText={setEditedContent}
                placeholder="Sisältö"
                placeholderTextColor={colors.textLight}
                multiline
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.contentText}>{entry.content}</Text>
            )}

            {/* Images */}
            {renderImages()}
          </>
        )}

        {!textOverlay && textPosition === 'middle' && (
          <>
            {/* Date Header */}
            <View style={styles.dateHeader}>
              <View style={styles.dateBox}>
                <Text style={styles.dayNumber}>{new Date(entry.date).getDate()}</Text>
                <Text style={styles.monthYear}>
                  {new Date(entry.date).toLocaleDateString('fi-FI', { month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <View style={styles.dateInfo}>
                <Text style={styles.dateText}>{formatDate(entry.date)}</Text>
                <Text style={styles.timeText}>{formatTime(entry.date)}</Text>
              </View>
            </View>

            {/* Title */}
            {isEditing ? (
              <TextInput
                style={styles.titleInput}
                value={editedTitle}
                onChangeText={setEditedTitle}
                placeholder="Otsikko"
                placeholderTextColor={colors.textLight}
              />
            ) : (
              <Text style={styles.title}>{entry.title}</Text>
            )}

            {/* Images */}
            {renderImages()}

            {/* Content */}
            {isEditing ? (
              <TextInput
                style={styles.contentInput}
                value={editedContent}
                onChangeText={setEditedContent}
                placeholder="Sisältö"
                placeholderTextColor={colors.textLight}
                multiline
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.contentText}>{entry.content}</Text>
            )}
          </>
        )}

        {!textOverlay && textPosition === 'bottom' && (
          <>
            {/* Date Header */}
            <View style={styles.dateHeader}>
              <View style={styles.dateBox}>
                <Text style={styles.dayNumber}>{new Date(entry.date).getDate()}</Text>
                <Text style={styles.monthYear}>
                  {new Date(entry.date).toLocaleDateString('fi-FI', { month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <View style={styles.dateInfo}>
                <Text style={styles.dateText}>{formatDate(entry.date)}</Text>
                <Text style={styles.timeText}>{formatTime(entry.date)}</Text>
              </View>
            </View>

            {/* Images */}
            {renderImages()}

            {/* Title */}
            {isEditing ? (
              <TextInput
                style={styles.titleInput}
                value={editedTitle}
                onChangeText={setEditedTitle}
                placeholder="Otsikko"
                placeholderTextColor={colors.textLight}
              />
            ) : (
              <Text style={styles.title}>{entry.title}</Text>
            )}

            {/* Content */}
            {isEditing ? (
              <TextInput
                style={styles.contentInput}
                value={editedContent}
                onChangeText={setEditedContent}
                placeholder="Sisältö"
                placeholderTextColor={colors.textLight}
                multiline
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.contentText}>{entry.content}</Text>
            )}
          </>
        )}

        {/* Location */}
        {entry.location && (
          <View style={styles.locationSection}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationText}>{entry.location.address}</Text>
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

      {/* Layout Selection Modal */}
      <Modal
        visible={layoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLayoutModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLayoutModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Asettelun muokkaus</Text>
            
            {/* Layout Type */}
            <Text style={styles.sectionTitle}>Kuvien asettelu</Text>
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'grid' && styles.layoutOptionActive]}
                onPress={() => setTempLayout('grid')}
              >
                <Text style={styles.layoutIcon}>⊞</Text>
                <Text style={styles.layoutName}>Ruudukko</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'masonry' && styles.layoutOptionActive]}
                onPress={() => setTempLayout('masonry')}
              >
                <Text style={styles.layoutIcon}>⊟</Text>
                <Text style={styles.layoutName}>Mosaiikki</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempLayout === 'magazine' && styles.layoutOptionActive]}
                onPress={() => setTempLayout('magazine')}
              >
                <Text style={styles.layoutIcon}>▭</Text>
                <Text style={styles.layoutName}>Lehti</Text>
              </TouchableOpacity>
            </View>

            {/* Text Position */}
            <Text style={styles.sectionTitle}>Tekstin sijainti</Text>
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[styles.layoutOption, tempTextPosition === 'top' && styles.layoutOptionActive]}
                onPress={() => setTempTextPosition('top')}
              >
                <Text style={styles.layoutIcon}>⬆️</Text>
                <Text style={styles.layoutName}>Ylhäällä</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempTextPosition === 'middle' && styles.layoutOptionActive]}
                onPress={() => setTempTextPosition('middle')}
              >
                <Text style={styles.layoutIcon}>↔️</Text>
                <Text style={styles.layoutName}>Keskellä</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempTextPosition === 'bottom' && styles.layoutOptionActive]}
                onPress={() => setTempTextPosition('bottom')}
              >
                <Text style={styles.layoutIcon}>⬇️</Text>
                <Text style={styles.layoutName}>Alhaalla</Text>
              </TouchableOpacity>
            </View>

            {/* Image Shape */}
            <Text style={styles.sectionTitle}>Kuvien muoto</Text>
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[styles.layoutOption, tempImageShape === 'square' && styles.layoutOptionActive]}
                onPress={() => setTempImageShape('square')}
              >
                <Text style={styles.layoutIcon}>◻️</Text>
                <Text style={styles.layoutName}>Neliö</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempImageShape === 'circle' && styles.layoutOptionActive]}
                onPress={() => setTempImageShape('circle')}
              >
                <Text style={styles.layoutIcon}>⚫</Text>
                <Text style={styles.layoutName}>Pyöreä</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layoutOption, tempImageShape === 'landscape' && styles.layoutOptionActive]}
                onPress={() => setTempImageShape('landscape')}
              >
                <Text style={styles.layoutIcon}>▬</Text>
                <Text style={styles.layoutName}>Vaaka</Text>
              </TouchableOpacity>
            </View>

            {/* Text Overlay */}
            <TouchableOpacity
              style={[styles.overlayToggle, tempTextOverlay && styles.overlayToggleActive]}
              onPress={() => setTempTextOverlay(!tempTextOverlay)}
            >
              <Text style={styles.overlayToggleIcon}>{tempTextOverlay ? '☑️' : '⬜'}</Text>
              <View>
                <Text style={styles.layoutName}>Teksti kuvien päällä</Text>
                <Text style={styles.layoutDescription}>Teksti näkyy gradienttitaustalla kuvien yllä</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setLayoutModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Peruuta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={async () => {
                  console.log('Saving layout:', tempLayout);
                  setLayout(tempLayout);
                  setTextPosition(tempTextPosition);
                  setImageShape(tempImageShape);
                  setTextOverlay(tempTextOverlay);
                  setLayoutModalVisible(false);
                  
                  // Tallennetaan asetukset tietokantaan
                  await updateEntry(entry.id, {
                    layout: tempLayout,
                    textPosition: tempTextPosition,
                    imageShape: tempImageShape,
                    textOverlay: tempTextOverlay,
                  });
                  onUpdate?.();
                }}
              >
                <Text style={styles.modalSaveText}>Tallenna</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
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
    paddingTop: 60,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm,
  },
  backButton: {
    ...commonStyles.body,
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
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: typography.fontSizes.lg,
  },
  textButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  cancelButtonText: {
    ...commonStyles.body,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
  },
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    ...commonStyles.body,
    color: colors.white,
    fontWeight: typography.fontWeights.semibold,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  dateBox: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    ...shadows.md,
  },
  dayNumber: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
    lineHeight: typography.fontSizes.xxxl,
  },
  monthYear: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.white,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  dateInfo: {
    flex: 1,
  },
  dateText: {
    ...commonStyles.heading3,
    marginBottom: spacing.xs,
  },
  timeText: {
    ...commonStyles.bodySecondary,
  },
  title: {
    ...commonStyles.heading1,
    marginBottom: spacing.lg,
  },
  titleInput: {
    ...commonStyles.heading1,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  contentText: {
    ...commonStyles.body,
    lineHeight: typography.fontSizes.md * typography.lineHeights.relaxed,
    marginBottom: spacing.xl,
  },
  contentInput: {
    ...commonStyles.body,
    lineHeight: typography.fontSizes.md * typography.lineHeights.relaxed,
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    minHeight: 150,
  },
  // Grid Layout
  gridLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
    marginHorizontal: -spacing.xs,
  },
  gridImageWrapper: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  circleImage: {
    borderRadius: borderRadius.full,
  },
  landscapeImage: {
    aspectRatio: 16 / 9,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridAddButton: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  gridAddIcon: {
    fontSize: typography.fontSizes.xxxl,
    color: colors.textLight,
  },
  // Masonry Layout
  masonryLayout: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    marginHorizontal: -spacing.xs,
  },
  masonryColumn: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  masonryImageWrapper: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.sm,
  },
  masonryImage: {
    width: '100%',
  },
  masonryAddButton: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 60,
    height: 60,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.xl,
  },
  // Magazine Layout
  magazineLayout: {
    marginBottom: spacing.xl,
  },
  magazineImageWrapper: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.sm,
  },
  magazineHero: {
    height: 300,
  },
  magazineSmall: {
    height: 150,
  },
  magazineImage: {
    width: '100%',
    height: '100%',
  },
  magazineAddButton: {
    height: 100,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  // Common image buttons
  removeImageButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  removeImageText: {
    color: colors.white,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.xxl,
  },
  addImageButton: {
    height: 150,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addImageIcon: {
    fontSize: typography.fontSizes.display,
    marginBottom: spacing.sm,
  },
  addImageText: {
    ...commonStyles.body,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  locationIcon: {
    fontSize: typography.fontSizes.xl,
    marginRight: spacing.sm,
  },
  locationText: {
    ...commonStyles.body,
    flex: 1,
  },
  metadata: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metadataText: {
    ...commonStyles.caption,
    marginBottom: spacing.xs,
  },
  // Text Overlay styles
  overlayContainer: {
    minHeight: 400,
    position: 'relative',
  },
  overlayBackgroundImage: {
    position: 'absolute',
    top: 0,
    left: -spacing.lg,
    right: -spacing.lg,
    height: 500,
    width: '120%',
  },
  overlayGradient: {
    position: 'absolute',
    top: 0,
    left: -spacing.lg,
    right: -spacing.lg,
    height: 500,
    width: '120%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayTextContainer: {
    position: 'relative',
    zIndex: 1,
    paddingVertical: spacing.xl,
  },
  overlayAdditionalImages: {
    marginTop: spacing.xl,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.xl,
  },
  modalTitle: {
    ...commonStyles.heading2,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  sectionTitle: {
    ...commonStyles.heading3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  layoutOption: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.xs,
    backgroundColor: colors.gray50,
  },
  layoutOptionActive: {
    backgroundColor: colors.primaryLight + '20',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  layoutIcon: {
    fontSize: typography.fontSizes.xxl,
    marginBottom: spacing.xs,
  },
  layoutName: {
    ...commonStyles.body,
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
  },
  layoutDescription: {
    ...commonStyles.caption,
    textAlign: 'center',
  },
  overlayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.gray50,
  },
  overlayToggleActive: {
    backgroundColor: colors.primaryLight + '20',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  overlayToggleIcon: {
    fontSize: typography.fontSizes.xxl,
    marginRight: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
  },
  modalCancelText: {
    ...commonStyles.body,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
  },
  modalSaveButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalSaveText: {
    ...commonStyles.body,
    color: colors.white,
    fontWeight: typography.fontWeights.semibold,
  },
});
