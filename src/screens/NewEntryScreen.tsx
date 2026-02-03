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
import { useAuth } from '../contexts/AuthContext';
import { createEntry, uploadImages } from '../services/diaryService';

export default function NewEntryScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();



  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

      // Save entry to Firestore with selected date
      await createEntry(
        {
          title: title.trim(),
          content: content.trim(),
          images: imageUrls,
          date: selectedDate,
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
        {/* Date Selector */}
        <View style={styles.dateSection}>
          <Text style={styles.sectionTitle}>Päivämäärä</Text>
          <TouchableOpacity 
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>📅</Text>
            <Text style={styles.dateText}>
              {selectedDate.toLocaleDateString('fi-FI', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Text>
          </TouchableOpacity>
        </View>

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
});
