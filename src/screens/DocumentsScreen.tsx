import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  InteractionManager,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import {
  getDocumentsProgressive,
  createDocument,
  uploadDocumentFile,
  deleteDocument,
} from '../services/documentService';
import { Document, DocumentCategory, DOCUMENT_CATEGORIES } from '../types/Document';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

type FilterCategory = DocumentCategory | 'all';

const CATEGORY_ORDER: DocumentCategory[] = ['receipt', 'contract', 'invoice', 'certificate', 'other'];

export default function DocumentsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.id === 'midnight';
  const locale = getLocaleFromLanguage(language);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all');
  const [loading, setLoading] = useState(true);
  const [streamingLoading, setStreamingLoading] = useState(false);
  const loadRequestIdRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const loadInFlightRef = useRef(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({
    title: '',
    description: '',
    category: 'other' as DocumentCategory,
    date: new Date(),
    tags: '',
  });

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    if (loadInFlightRef.current) return;

    const requestId = ++loadRequestIdRef.current;
    const showFullLoader = !initialLoadDoneRef.current;
    loadInFlightRef.current = true;

    try {
      if (showFullLoader) {
        setLoading(true);
      }
      setStreamingLoading(true);

      await getDocumentsProgressive(
        user.uid,
        (partialDocs, done) => {
          if (requestId !== loadRequestIdRef.current) return;
          setDocuments(partialDocs);
          if (done) {
            setStreamingLoading(false);
            setLoading(false);
            initialLoadDoneRef.current = true;
          }
        },
        10
      );
    } catch {
      Alert.alert(t('common_error'), t('documents_load_failed'));
      if (requestId === loadRequestIdRef.current) {
        setStreamingLoading(false);
        setLoading(false);
      }
    } finally {
      if (requestId === loadRequestIdRef.current && showFullLoader) {
        setLoading(false);
      }
      loadInFlightRef.current = false;
    }
  }, [t, user]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadDocuments();
      });

      return () => {
        task.cancel();
      };
    }, [loadDocuments]),
  );

  const categoryLabel = useCallback((category: DocumentCategory): string => {
    switch (category) {
      case 'receipt':
        return t('doc_category_receipt');
      case 'contract':
        return t('doc_category_contract');
      case 'invoice':
        return t('doc_category_invoice');
      case 'certificate':
        return t('doc_category_certificate');
      default:
        return t('doc_category_other');
    }
  }, [t]);

  const filteredDocuments = useMemo(() => {
    let next = [...documents];

    if (selectedCategory !== 'all') {
      next = next.filter((doc) => doc.category === selectedCategory);
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return next;

    return next.filter((doc) =>
      doc.title.toLowerCase().includes(query) ||
      doc.description?.toLowerCase().includes(query) ||
      doc.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [documents, searchQuery, selectedCategory]);

  const uploadSelectedFile = async (uri: string, fileType: string, fileName: string) => {
    if (!user) return;

    if (!newDoc.title.trim()) {
      Alert.alert(t('documents_missing_title'), t('documents_missing_title_msg'));
      return;
    }

    try {
      setUploading(true);

      const fileUrl = await uploadDocumentFile(uri, user.uid, fileName, fileType);
      const tags = newDoc.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      await createDocument(
        {
          title: newDoc.title,
          description: newDoc.description,
          category: newDoc.category,
          fileUrl,
          fileName,
          fileType,
          fileSize: 0,
          thumbnailUrl: fileType === 'image' ? fileUrl : undefined,
          date: newDoc.date,
          tags,
          userId: user.uid,
        },
        user.uid,
      );

      setNewDoc({
        title: '',
        description: '',
        category: 'other',
        date: new Date(),
        tags: '',
      });
      setShowAddModal(false);
      await loadDocuments();

      Alert.alert(t('common_success'), t('documents_save_success'));
    } catch {
      Alert.alert(t('common_error'), t('documents_save_failed'));
    } finally {
      setUploading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common_permission_required'), t('documents_gallery_permission'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        await uploadSelectedFile(asset.uri, 'image', asset.fileName || 'image.jpg');
      }
    } catch {
      Alert.alert(t('common_error'), t('documents_image_failed'));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common_permission_required'), t('documents_camera_permission'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        await uploadSelectedFile(result.assets[0].uri, 'image', 'photo.jpg');
      }
    } catch {
      Alert.alert(t('common_error'), t('documents_camera_failed'));
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const fileType = asset.mimeType?.includes('pdf') ? 'pdf' : 'docx';
        await uploadSelectedFile(asset.uri, fileType, asset.name);
      }
    } catch {
      Alert.alert(t('common_error'), t('documents_pick_failed'));
    }
  };

  const handleDeleteDocument = useCallback((doc: Document) => {
    Alert.alert(t('documents_delete_title'), t('documents_delete_confirm', { title: doc.title }), [
      { text: t('common_cancel'), style: 'cancel' },
      {
        text: t('common_delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(doc.id);
            await loadDocuments();
            Alert.alert(t('common_deleted'), t('documents_deleted'));
          } catch {
            Alert.alert(t('common_error'), t('documents_delete_failed'));
          }
        },
      },
    ]);
  }, [loadDocuments, t]);

  const renderDocument = useCallback(({ item }: { item: Document }) => {
    const category = DOCUMENT_CATEGORIES[item.category] ?? DOCUMENT_CATEGORIES.other;
    const safeTags = Array.isArray(item.tags) ? item.tags : [];

    return (
      <TouchableOpacity
        style={[
          styles.documentCard,
          {
            backgroundColor: isDark ? '#111827' : theme.colors.white,
            borderColor: theme.colors.border,
            borderWidth: 1,
          },
        ]}
        onPress={() =>
          navigation.navigate('DocumentDetail', {
            document: {
              ...item,
              date: item.date.toISOString(),
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            },
          })
        }
        onLongPress={() => handleDeleteDocument(item)}
      >
        <View style={styles.documentHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: category.color + '20' }]}>
            <Text style={styles.categoryIcon}>{category.icon}</Text>
          </View>
          <View style={styles.documentInfo}>
            <Text style={[styles.documentTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.documentDate, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{new Date(item.date).toLocaleDateString(locale)}</Text>
          </View>
          <View style={[styles.fileTypeBadge, { backgroundColor: isDark ? '#1E293B' : colors.gray100 }]}>
            <Text style={[styles.fileTypeText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{item.fileType.toUpperCase()}</Text>
          </View>
        </View>

        {item.description ? (
          <Text style={[styles.documentDescription, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        {safeTags.length > 0 ? (
          <View style={styles.tagsContainer}>
            {safeTags.slice(0, 3).map((tag, index) => (
              <View key={`${item.id}-${index}`} style={styles.tag}>
                <Text style={[styles.tagText, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{tag}</Text>
              </View>
            ))}
            {safeTags.length > 3 ? <Text style={[styles.moreTagsText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>+{safeTags.length - 3}</Text> : null}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }, [handleDeleteDocument, locale, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.white,
            borderBottomColor: theme.colors.border,
            paddingTop: insets.top + spacing.sm,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('documents_header')}</Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
          {t(documents.length === 1 ? 'documents_count_one' : 'documents_count_many', {
            n: documents.length,
          })}
        </Text>
      </View>

      <View style={[styles.controlsContainer, { backgroundColor: theme.colors.background }] }>
        <View style={[styles.searchContainer, { backgroundColor: isDark ? '#0B1220' : theme.colors.white, borderColor: theme.colors.border }] }>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}
            placeholder={t('documents_search_placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Text style={[styles.clearButtonText, { color: theme.colors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            style={[
              styles.categoryChip,
              { backgroundColor: isDark ? '#1E293B' : colors.gray100, borderColor: theme.colors.border },
              selectedCategory === 'all' && [styles.categoryChipActive, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }],
            ]}
            onPress={() => setSelectedCategory('all')}
          >
            <Text style={[styles.categoryChipText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }, selectedCategory === 'all' && styles.categoryChipTextActive]}>
              {t('documents_all')}
            </Text>
          </TouchableOpacity>

          {CATEGORY_ORDER.map((key) => {
            const value = DOCUMENT_CATEGORIES[key];
            const isActive = selectedCategory === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.categoryChip,
                  { backgroundColor: isDark ? '#1E293B' : colors.gray100, borderColor: theme.colors.border },
                  isActive && [styles.categoryChipActive, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }],
                ]}
                onPress={() => setSelectedCategory(key)}
              >
                <Text style={styles.categoryChipIcon}>{value.icon}</Text>
                <Text style={[styles.categoryChipText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }, isActive && styles.categoryChipTextActive]}>
                  {categoryLabel(key)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

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
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📄</Text>
              <Text style={[styles.emptyTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>
                {searchQuery.trim() ? t('documents_no_results') : t('documents_empty')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                {searchQuery.trim() ? t('documents_no_results_sub') : t('documents_empty_sub')}
              </Text>
            </View>
          }
          ListFooterComponent={
            streamingLoading ? (
              <View style={styles.streamingFooter}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.streamingText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                  {t('common_loading')}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <TouchableOpacity style={[styles.fab, { backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary }]} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
        <Text style={[styles.fabIcon, { fontFamily: theme.fonts.bodyFamily }]}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.white }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('documents_add_title')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={[styles.modalClose, { color: theme.colors.textSecondary }]}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_title_label')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}
                placeholder={t('documents_title_placeholder')}
                placeholderTextColor={theme.colors.textSecondary}
                value={newDoc.title}
                onChangeText={(text) => setNewDoc((prev) => ({ ...prev, title: text }))}
              />

              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_description_label')}</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}
                placeholder={t('documents_description_placeholder')}
                placeholderTextColor={theme.colors.textSecondary}
                value={newDoc.description}
                onChangeText={(text) => setNewDoc((prev) => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_category_label')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categorySelect}>
                  {CATEGORY_ORDER.map((key) => {
                    const value = DOCUMENT_CATEGORIES[key];
                    const isActive = newDoc.category === key;
                    return (
                      <TouchableOpacity
                        key={`modal-${key}`}
                        style={[
                          styles.categoryOption,
                          { backgroundColor: isDark ? '#1E293B' : colors.gray50, borderColor: theme.colors.border },
                          isActive && [styles.categoryOptionActive, { borderColor: theme.colors.primary, backgroundColor: isDark ? '#0F172A' : colors.primaryLight + '20' }],
                        ]}
                        onPress={() => setNewDoc((prev) => ({ ...prev, category: key }))}
                      >
                        <Text style={styles.categoryOptionIcon}>{value.icon}</Text>
                        <Text style={[styles.categoryOptionText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{categoryLabel(key)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_tags_label')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}
                placeholder={t('documents_tags_placeholder')}
                placeholderTextColor={theme.colors.textSecondary}
                value={newDoc.tags}
                onChangeText={(text) => setNewDoc((prev) => ({ ...prev, tags: text }))}
              />

              <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_select_file')}</Text>

              <TouchableOpacity style={[styles.actionButton, { backgroundColor: isDark ? '#1E293B' : colors.gray50, borderColor: theme.colors.border }]} onPress={handleTakePhoto}>
                <Text style={styles.actionButtonIcon}>📷</Text>
                <Text style={[styles.actionButtonText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_take_photo')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionButton, { backgroundColor: isDark ? '#1E293B' : colors.gray50, borderColor: theme.colors.border }]} onPress={handlePickImage}>
                <Text style={styles.actionButtonIcon}>🖼️</Text>
                <Text style={[styles.actionButtonText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_pick_image')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionButton, { backgroundColor: isDark ? '#1E293B' : colors.gray50, borderColor: theme.colors.border }]} onPress={handlePickDocument}>
                <Text style={styles.actionButtonIcon}>📎</Text>
                <Text style={[styles.actionButtonText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_pick_pdf')}</Text>
              </TouchableOpacity>
            </ScrollView>

            {uploading ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.uploadingText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('documents_uploading')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  header: {
    backgroundColor: colors.white,
    paddingTop: spacing.md,
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
  controlsContainer: {
    backgroundColor: colors.backgroundLight,
    paddingTop: spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
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
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  clearButtonText: {
    fontSize: 24,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  categoryScroll: {
    maxHeight: 64,
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 42,
    marginRight: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  categoryChipText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm + 4,
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
  streamingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  streamingText: {
    fontSize: typography.fontSizes.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl + spacing.xxl,
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
    paddingTop: spacing.xxxl,
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
    lineHeight: 34,
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
    lineHeight: 36,
  },
  modalBody: {
    paddingHorizontal: spacing.lg,
  },
  modalBodyContent: {
    paddingBottom: spacing.xxl,
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
    paddingBottom: spacing.xs,
  },
  categoryOption: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray50,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 86,
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
