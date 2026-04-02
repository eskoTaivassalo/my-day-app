import React, { useState } from 'react';
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
import { deleteDocument } from '../services/documentService';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';

export default function DocumentDetailScreen({ route, navigation }: any) {
  const docParam = route.params.document;
  const document: Document = {
    ...docParam,
    date: new Date(docParam.date),
    createdAt: new Date(docParam.createdAt),
    updatedAt: new Date(docParam.updatedAt),
  };
  const [loading, setLoading] = useState(false);
  const category = DOCUMENT_CATEGORIES[document.category];

  const handleOpenDocument = async () => {
    try {
      const supported = await Linking.canOpenURL(document.fileUrl);
      if (supported) {
        await Linking.openURL(document.fileUrl);
      } else {
        Alert.alert('Virhe', 'Tiedostoa ei voida avata');
      }
    } catch (error) {
      console.error('Error opening document:', error);
      Alert.alert('Virhe', 'Tiedoston avaaminen epäonnistui');
    }
  };

  const handleShareDocument = async () => {
    try {
      setLoading(true);
      
      // Download file to cache
      const fileUri = FileSystem.cacheDirectory + document.fileName;
      const downloadResult = await FileSystem.downloadAsync(document.fileUrl, fileUri);
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Virhe', 'Jakaminen ei ole saatavilla tällä laitteella');
        return;
      }

      // Share the file
      await Sharing.shareAsync(downloadResult.uri);
    } catch (error) {
      console.error('Error sharing document:', error);
      Alert.alert('Virhe', 'Dokumentin jakaminen epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = () => {
    Alert.alert(
      'Poista dokumentti',
      `Haluatko varmasti poistaa dokumentin "${document.title}"?`,
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Poista',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDocument(document.id);
              Alert.alert('Poistettu', 'Dokumentti poistettu', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (error) {
              Alert.alert('Virhe', 'Dokumentin poistaminen epäonnistui');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{document.title}</Text>
        <TouchableOpacity onPress={handleDeleteDocument} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Document Preview */}
        {document.fileType === 'image' && document.thumbnailUrl && (
          <View style={styles.previewContainer}>
            <Image 
              source={{ uri: document.thumbnailUrl }} 
              style={styles.previewImage}
              resizeMode="contain"
            />
          </View>
        )}

        {document.fileType === 'pdf' && (
          <View style={styles.fileTypePreview}>
            <Text style={styles.fileTypeIcon}>📄</Text>
            <Text style={styles.fileTypeName}>PDF-dokumentti</Text>
          </View>
        )}

        {document.fileType === 'docx' && (
          <View style={styles.fileTypePreview}>
            <Text style={styles.fileTypeIcon}>📝</Text>
            <Text style={styles.fileTypeName}>Word-dokumentti</Text>
          </View>
        )}

        {/* Document Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Kategoria</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={styles.categoryText}>{category.label}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Päivämäärä</Text>
            <Text style={styles.infoValue}>
              {new Date(document.date).toLocaleDateString('fi-FI', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tiedostotyyppi</Text>
            <Text style={styles.infoValue}>{document.fileType.toUpperCase()}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tiedostonimi</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{document.fileName}</Text>
          </View>

          {document.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.infoLabel}>Kuvaus</Text>
              <Text style={styles.descriptionText}>{document.description}</Text>
            </View>
          )}

          {document.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.infoLabel}>Tagit</Text>
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
              Luotu: {new Date(document.createdAt).toLocaleDateString('fi-FI')} {new Date(document.createdAt).toLocaleTimeString('fi-FI')}
            </Text>
            {document.updatedAt && document.updatedAt !== document.createdAt && (
              <Text style={styles.timestampText}>
                Päivitetty: {new Date(document.updatedAt).toLocaleDateString('fi-FI')} {new Date(document.updatedAt).toLocaleTimeString('fi-FI')}
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleOpenDocument}
            disabled={loading}
          >
            <Text style={styles.actionButtonIcon}>🔗</Text>
            <Text style={styles.actionButtonText}>Avaa dokumentti</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleShareDocument}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>📤</Text>
                <Text style={styles.actionButtonText}>Jaa dokumentti</Text>
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
