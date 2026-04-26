import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Document, DOCUMENT_CATEGORIES } from '../types/Document';
import { deleteDocument, getDecryptedDocumentUri, isEncryptedDocumentUrl } from '../services/documentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

export default function DocumentDetailScreen({ route, navigation }: any) {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const locale = getLocaleFromLanguage(language);
  const docParam = route.params.document;
  const document: Document = {
    ...docParam,
    date: new Date(docParam.date),
    createdAt: new Date(docParam.createdAt),
    updatedAt: new Date(docParam.updatedAt),
  };
  const [loading, setLoading] = useState(false);
  const [resolvedFileUri, setResolvedFileUri] = useState(document.fileUrl);
  const [resolvedThumbnailUri, setResolvedThumbnailUri] = useState(document.thumbnailUrl || null);
  const [resolvingFile, setResolvingFile] = useState(false);
  const category = DOCUMENT_CATEGORIES[document.category];
  const categoryLabel = useMemo(() =>
    document.category === 'receipt'
      ? t('doc_category_receipt')
      : document.category === 'contract'
      ? t('doc_category_contract')
      : document.category === 'invoice'
      ? t('doc_category_invoice')
      : document.category === 'certificate'
      ? t('doc_category_certificate')
      : t('doc_category_other'),
    [document.category, t]
  );

  useEffect(() => {
    let isMounted = true;

    const resolveUris = async () => {
      try {
        setResolvingFile(true);

        const decryptedFileUri = await getDecryptedDocumentUri(
          document.fileUrl,
          document.fileName,
          document.fileType
        );
        if (isMounted) {
          setResolvedFileUri(decryptedFileUri);
        }

        if (document.thumbnailUrl) {
          const decryptedThumbUri = await getDecryptedDocumentUri(
            document.thumbnailUrl,
            document.fileName,
            document.fileType
          );
          if (isMounted) {
            setResolvedThumbnailUri(decryptedThumbUri);
          }
        }
      } catch {
      } finally {
        if (isMounted) {
          setResolvingFile(false);
        }
      }
    };

    resolveUris();

    return () => {
      isMounted = false;
    };
  }, [document.fileUrl, document.thumbnailUrl, document.fileName, document.fileType]);

  const handleOpenDocument = async () => {
    try {
      const openUri = resolvedFileUri || document.fileUrl;
      const supported = await Linking.canOpenURL(openUri);
      if (supported) {
        await Linking.openURL(openUri);
      } else {
        Alert.alert(t('common_error'), t('doc_detail_open_failed'));
      }
    } catch {
      Alert.alert(t('common_error'), t('doc_detail_open_failed'));
    }
  };

  const handleShareDocument = async () => {
    try {
      setLoading(true);

      const targetUri = resolvedFileUri || document.fileUrl;
      
      let shareUri = targetUri;

      // Jos tiedosto on vielä salatussa etä-URL:ssa, lataa cacheen jakamista varten
      if (!targetUri.startsWith('file://')) {
        const fileUri = FileSystem.cacheDirectory + document.fileName;
        const downloadResult = await FileSystem.downloadAsync(targetUri, fileUri);
        shareUri = downloadResult.uri;
      }
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t('common_error'), t('doc_detail_share_no_support'));
        return;
      }

      // Share the file
      await Sharing.shareAsync(shareUri);
    } catch {
      Alert.alert(t('common_error'), t('doc_detail_share_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = () => {
    Alert.alert(
      t('documents_delete_title'),
      t('doc_detail_delete_confirm', { title: document.title }),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('common_delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDocument(document.id);
              Alert.alert(t('common_deleted'), t('documents_deleted'), [
                { text: t('common_ok'), onPress: () => navigation.goBack() }
              ]);
            } catch (error) {
              Alert.alert(t('common_error'), t('documents_delete_failed'));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }] }>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: theme.colors.primary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]} numberOfLines={1}>{document.title}</Text>
        <TouchableOpacity onPress={handleDeleteDocument} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Document Preview */}
        {document.fileType === 'image' && (resolvedThumbnailUri || document.thumbnailUrl) && (
          <View style={styles.previewContainer}>
            {resolvingFile && isEncryptedDocumentUrl(document.fileUrl) ? (
              <View style={styles.previewLoadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.previewLoadingText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_decrypting')}</Text>
              </View>
            ) : (
              <Image 
                source={{ uri: resolvedThumbnailUri || document.thumbnailUrl! }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
          </View>
        )}

        {document.fileType === 'pdf' && (
          <View style={[styles.fileTypePreview, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border, borderWidth: 1 }]}>
            <Text style={styles.fileTypeIcon}>📄</Text>
            <Text style={[styles.fileTypeName, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_pdf')}</Text>
          </View>
        )}

        {document.fileType === 'docx' && (
          <View style={[styles.fileTypePreview, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border, borderWidth: 1 }]}>
            <Text style={styles.fileTypeIcon}>📝</Text>
            <Text style={[styles.fileTypeName, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_word')}</Text>
          </View>
        )}

        {/* Document Info */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border, borderWidth: 1 }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_category')}</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={styles.categoryText}>{categoryLabel}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_date')}</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>
              {new Date(document.date).toLocaleDateString(locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_file_type')}</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{document.fileType.toUpperCase()}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_file_name')}</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={1}>{document.fileName}</Text>
          </View>

          {document.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.infoLabel}>{t('doc_detail_description')}</Text>
              <Text style={styles.descriptionText}>{document.description}</Text>
            </View>
          )}

          {document.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.infoLabel}>{t('doc_detail_tags')}</Text>
              <View style={styles.tagsContainer}>
                {document.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.timestampSection}>
            <Text style={styles.timestampText}>
              {t('doc_detail_created')} {new Date(document.createdAt).toLocaleDateString(locale)} {new Date(document.createdAt).toLocaleTimeString(locale)}
            </Text>
            {document.updatedAt && document.updatedAt.getTime() !== document.createdAt.getTime() && (
              <Text style={styles.timestampText}>
                {t('doc_detail_updated')} {new Date(document.updatedAt).toLocaleDateString(locale)} {new Date(document.updatedAt).toLocaleTimeString(locale)}
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border }] } 
            onPress={handleOpenDocument}
            disabled={loading}
          >
            <Text style={styles.actionButtonIcon}>🔗</Text>
            <Text style={[styles.actionButtonText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_open')}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border }] } 
            onPress={handleShareDocument}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>📤</Text>
                <Text style={[styles.actionButtonText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('doc_detail_share')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingTop: 60,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm,
  },
  backButton: {
    width: 40,
  },
  backButtonText: {
    fontSize: 32,
    color: colors.primary,
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  deleteButton: {
    width: 40,
    alignItems: 'flex-end',
  },
  deleteButtonText: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  previewContainer: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  previewImage: {
    width: '100%',
    height: 300,
  },
  previewLoadingContainer: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  previewLoadingText: {
    fontSize: typography.fontSizes.sm,
  },
  fileTypePreview: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.md,
  },
  fileTypeIcon: {
    fontSize: 60,
    marginBottom: spacing.md,
  },
  fileTypeName: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  infoCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  categoryText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
  },
  descriptionSection: {
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.md,
  },
  descriptionText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  tagsSection: {
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.md,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
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
    fontWeight: typography.fontWeights.medium,
  },
  timestampSection: {
    paddingTop: spacing.md,
  },
  timestampText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  actionsContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  actionButtonIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  actionButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
});
