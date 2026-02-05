import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { 
  getDocuments, 
  createDocument, 
  uploadDocumentFile, 
  deleteDocument 
} from '../services/documentService';
import { Document, DocumentCategory, DOCUMENT_CATEGORIES } from '../types/Document';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

export default function DocumentsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  // New document form
  const [newDoc, setNewDoc] = useState({
    title: '',
    description: '',
    category: 'other' as DocumentCategory,
    date: new Date(),
    tags: '',
  });

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadDocuments();
      }
    }, [user])
  );

  useEffect(() => {
    filterDocuments();
  }, [documents, searchQuery, selectedCategory]);

  const loadDocuments = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const docs = await getDocuments(user.uid);
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
      Alert.alert('Virhe', 'Dokumenttien lataaminen epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  const filterDocuments = () => {
    let filtered = [...documents];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(doc => doc.category === selectedCategory);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc =>
        doc.title.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredDocuments(filtered);
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Lupa tarvitaan', 'Tarvitsemme luvan päästäksemme kuvagalleriaan.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        await uploadDocument(result.assets[0].uri, 'image', result.assets[0].fileName || 'image.jpg');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Virhe', 'Kuvan valitseminen epäonnistui');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Lupa tarvitaan', 'Tarvitsemme luvan kameraan.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        await uploadDocument(result.assets[0].uri, 'image', 'photo.jpg');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Virhe', 'Kuvan ottaminen epäonnistui');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const fileType = asset.mimeType?.includes('pdf') ? 'pdf' : 'docx';
        await uploadDocument(asset.uri, fileType, asset.name);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Virhe', 'Dokumentin valitseminen epäonnistui');
    }
  };

  const uploadDocument = async (uri: string, fileType: string, fileName: string) => {
    if (!user) return;
    if (!newDoc.title.trim()) {
      Alert.alert('Puuttuva otsikko', 'Anna dokumentille otsikko.');
      return;
    }

    try {
      setUploading(true);

      // Upload file to Firebase Storage
      const fileUrl = await uploadDocumentFile(uri, user.uid, fileName, fileType);

      // Create document record
      const tags = newDoc.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      await createDocument(
        {
          title: newDoc.title,
          description: newDoc.description,
          category: newDoc.category,
          fileUrl,
          fileName,
          fileType,
          fileSize: 0, // Could get actual size from file
          thumbnailUrl: fileType === 'image' ? fileUrl : undefined,
          date: newDoc.date,
          tags,
          userId: user.uid,
        },
        user.uid
      );

      // Reset form
      setNewDoc({
        title: '',
        description: '',
        category: 'other',
        date: new Date(),
        tags: '',
      });
      
      setShowAddModal(false);
      await loadDocuments();
      
      Alert.alert('Onnistui!', 'Dokumentti tallennettu');
    } catch (error) {
      console.error('Error uploading document:', error);
      Alert.alert('Virhe', 'Dokumentin tallentaminen epäonnistui');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = (doc: Document) => {
    Alert.alert(
      'Poista dokumentti',
      `Haluatko varmasti poistaa dokumentin "${doc.title}"?`,
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Poista',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDocument(doc.id);
              await loadDocuments();
              Alert.alert('Poistettu', 'Dokumentti poistettu');
            } catch (error) {
              Alert.alert('Virhe', 'Dokumentin poistaminen epäonnistui');
            }
          },
        },
      ]
    );
  };

  const renderDocument = ({ item }: { item: Document }) => {
    const category = DOCUMENT_CATEGORIES[item.category];
    
    return (
      <TouchableOpacity
        style={styles.documentCard}
        onPress={() => navigation.navigate('DocumentDetail', { 
          document: {
            ...item,
            date: item.date.toISOString(),
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          }
        })}
        onLongPress={() => handleDeleteDocument(item)}
      >
        <View style={styles.documentHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: category.color + '20' }]}>
            <Text style={styles.categoryIcon}>{category.icon}</Text>
          </View>
          <View style={styles.documentInfo}>
            <Text style={styles.documentTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.documentDate}>
              {new Date(item.date).toLocaleDateString('fi-FI')}
            </Text>
          </View>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>{item.fileType.toUpperCase()}</Text>
          </View>
        </View>
        
        {item.description && (
          <Text style={styles.documentDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        
        {item.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {item.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {item.tags.length > 3 && (
              <Text style={styles.moreTagsText}>+{item.tags.length - 3}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dokumentit</Text>
        <Text style={styles.headerSubtitle}>
          {documents.length} {documents.length === 1 ? 'dokumentti' : 'dokumenttia'}
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Hae dokumentteja..."
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

      {/* Category Filter */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
        <TouchableOpacity
          style={[
            styles.categoryChip,
            selectedCategory === 'all' && styles.categoryChipActive
          ]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[
            styles.categoryChipText,
            selectedCategory === 'all' && styles.categoryChipTextActive
          ]}>
            Kaikki
          </Text>
        </TouchableOpacity>
        
        {Object.entries(DOCUMENT_CATEGORIES).map(([key, value]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.categoryChip,
              selectedCategory === key && styles.categoryChipActive
            ]}
            onPress={() => setSelectedCategory(key as DocumentCategory)}
          >
            <Text style={styles.categoryChipIcon}>{value.icon}</Text>
            <Text style={[
              styles.categoryChipText,
              selectedCategory === key && styles.categoryChipTextActive
            ]}>
              {value.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Documents List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredDocuments}
          renderItem={renderDocument}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📄</Text>
              <Text style={styles.emptyTitle}>
                {searchQuery.trim() ? 'Ei tuloksia' : 'Ei dokumentteja'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim() 
                  ? 'Kokeile erilaista hakusanaa'
                  : 'Aloita lisäämällä ensimmäinen dokumentti'}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Add Document Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lisää dokumentti</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Otsikko *</Text>
              <TextInput
                style={styles.input}
                placeholder="Esim. Kaupan kuitti 02/2026"
                value={newDoc.title}
                onChangeText={(text) => setNewDoc({ ...newDoc, title: text })}
              />

              <Text style={styles.label}>Kuvaus</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Lisätietoja dokumentista..."
                value={newDoc.description}
                onChangeText={(text) => setNewDoc({ ...newDoc, description: text })}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>Kategoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categorySelect}>
                  {Object.entries(DOCUMENT_CATEGORIES).map(([key, value]) => (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.categoryOption,
                        newDoc.category === key && styles.categoryOptionActive
                      ]}
                      onPress={() => setNewDoc({ ...newDoc, category: key as DocumentCategory })}
                    >
                      <Text style={styles.categoryOptionIcon}>{value.icon}</Text>
                      <Text style={styles.categoryOptionText}>{value.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.label}>Tagit (pilkulla eroteltuna)</Text>
              <TextInput
                style={styles.input}
                placeholder="Esim. ruokakauppa, S-market, elintarvikkeet"
                value={newDoc.tags}
                onChangeText={(text) => setNewDoc({ ...newDoc, tags: text })}
              />

              <Text style={styles.sectionTitle}>Valitse tiedosto</Text>
              
              <TouchableOpacity style={styles.actionButton} onPress={handleTakePhoto}>
                <Text style={styles.actionButtonIcon}>📷</Text>
                <Text style={styles.actionButtonText}>Ota kuva</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={handlePickImage}>
                <Text style={styles.actionButtonIcon}>🖼️</Text>
                <Text style={styles.actionButtonText}>Valitse kuva</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={handlePickDocument}>
                <Text style={styles.actionButtonIcon}>📎</Text>
                <Text style={styles.actionButtonText}>Valitse PDF/DOCX</Text>
              </TouchableOpacity>
            </ScrollView>

            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.uploadingText}>Tallennetaan...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    ...commonStyles.heading1,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...commonStyles.bodySecondary,
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
  },
  categoryScroll: {
    maxHeight: 50,
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryChipIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  categoryChipText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
  },
  documentCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  categoryIcon: {
    fontSize: 20,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  documentDate: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  fileTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
  },
  fileTypeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.textSecondary,
  },
  documentDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.primaryLight + '20',
    borderRadius: borderRadius.sm,
  },
  tagText: {
    fontSize: typography.fontSizes.xs,
    color: colors.primary,
  },
  moreTagsText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    alignSelf: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: spacing.lg,
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
    fontSize: 32,
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  modalClose: {
    fontSize: 36,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.bold,
  },
  modalBody: {
    padding: spacing.lg,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  categorySelect: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  categoryOption: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray50,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 80,
  },
  categoryOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  categoryOptionIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  categoryOptionText: {
    fontSize: typography.fontSizes.xs,
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionButtonIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  actionButtonText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    marginTop: spacing.md,
  },
});
