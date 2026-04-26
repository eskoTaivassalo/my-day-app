import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import {
  getReminders,
  saveReminder,
  deleteReminder,
  scheduleReminderNotification,
  getCalendarSyncEnabled,
  getSelectedCalendarId,
  createCalendarEvent,
  Reminder,
} from '../services/reminderService';

export default function RemindersScreen({ navigation }: any) {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const locale = getLocaleFromLanguage(language);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dateTime, setDateTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const resetForm = () => {
    setTitle('');
    setNotes('');
    setDateTime(new Date());
    setEditingReminder(null);
  };

  const loadReminders = async () => {
    const data = await getReminders();
    const now = Date.now();
    const upcoming = data.filter((reminder) => new Date(reminder.dateTime).getTime() >= now);
    setReminders(upcoming);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReminders();
    setRefreshing(false);
  };

  useEffect(() => {
    loadReminders();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadReminders();
    }, [])
  );

  const handleSave = async () => {
    const isEditing = editingReminder !== null;

    if (!title.trim()) {
      Alert.alert(t('reminders_missing_title'), t('reminders_missing_title_msg'));
      return;
    }

    if (dateTime.getTime() <= Date.now()) {
      Alert.alert(t('reminders_past_time'), t('reminders_past_time_msg'));
      return;
    }

    const notificationId = await scheduleReminderNotification(title.trim(), dateTime);
    let calendarEventId: string | null = null;

    const calendarSyncEnabled = await getCalendarSyncEnabled();
    if (calendarSyncEnabled) {
      const calendarId = await getSelectedCalendarId();
      if (calendarId) {
        calendarEventId = await createCalendarEvent(calendarId, title.trim(), dateTime, notes.trim() || undefined);
      }
    }

    const reminder: Reminder = {
      id: editingReminder?.id ?? `${Date.now()}`,
      title: title.trim(),
      dateTime: dateTime.toISOString(),
      notes: notes.trim() || undefined,
      createdAt: editingReminder?.createdAt ?? new Date().toISOString(),
      notificationId: notificationId || undefined,
      calendarEventId: calendarEventId || undefined,
    };

    if (isEditing && editingReminder) {
      await deleteReminder(
        editingReminder.id,
        editingReminder.notificationId,
        editingReminder.calendarEventId
      );
    }

    await saveReminder(reminder);
    resetForm();
    await loadReminders();

    Alert.alert(
      isEditing ? t('reminders_updated_title') : t('reminders_saved_title'),
      notificationId
        ? (isEditing
            ? t('reminders_updated_with_notification')
            : t('reminders_saved_with_notification'))
        : (isEditing
            ? t('reminders_updated_without_notification')
            : t('reminders_saved_without_notification'))
    );
  };

  const handleDelete = (id: string, notificationId?: string, calendarEventId?: string) => {
    Alert.alert(t('reminders_delete_confirm_title'), t('reminders_delete_confirm_msg'), [
      { text: t('common_cancel'), style: 'cancel' },
      {
        text: t('reminders_delete_button'),
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(id, notificationId, calendarEventId);
          await loadReminders();
          if (editingReminder?.id === id) {
            resetForm();
          }
        },
      },
    ]);
  };

  const handleEditPress = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setTitle(reminder.title);
    setNotes(reminder.notes || '');
    setDateTime(new Date(reminder.dateTime));
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const onChangeDate = (_event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const next = new Date(dateTime);
      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setDateTime(next);
    }
  };

  const onChangeTime = (_event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const next = new Date(dateTime);
      next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      setDateTime(next);
    }
  };

  const formattedDate = dateTime.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedTime = dateTime.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }] }>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }]}>{t('common_back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('reminders_header')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        <View style={[styles.card, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border }]}>
          <View style={styles.formHeaderRow}>
            <Text style={[styles.formTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>
              {editingReminder ? t('reminders_update_button') : t('reminders_header')}
            </Text>
            {editingReminder && (
              <View style={[styles.editingPill, { backgroundColor: theme.colors.primary }] }>
                <Text style={[styles.editingPillText, { fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_edit_button')}</Text>
              </View>
            )}
          </View>

          {editingReminder && (
            <Text style={[styles.editingLabel, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_editing_label')}</Text>
          )}

          <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_title_label')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}
            placeholder={t('reminders_title_placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.pickerRow}>
            <View style={styles.pickerColumn}>
              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_date_label')}</Text>
              <TouchableOpacity style={[styles.pickerButton, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border }]} onPress={() => setShowDatePicker(true)}>
                <Text style={[styles.pickerText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{formattedDate}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pickerColumn}>
              <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_time_label')}</Text>
              <TouchableOpacity style={[styles.pickerButton, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border }]} onPress={() => setShowTimePicker(true)}>
                <Text style={[styles.pickerText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{formattedTime}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_notes_label')}</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: isDark ? '#0B1220' : colors.gray50, borderColor: theme.colors.border, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}
            placeholder={t('reminders_notes_placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: isDark ? theme.colors.primaryDark : theme.colors.primary }]} onPress={handleSave}>
            <Text style={[styles.saveButtonText, { fontFamily: theme.fonts.bodyFamily }]}>
              {editingReminder ? t('reminders_update_button') : t('reminders_save_button')}
            </Text>
          </TouchableOpacity>

          {editingReminder && (
            <TouchableOpacity style={[styles.cancelEditButton, { backgroundColor: theme.colors.white, borderColor: theme.colors.border }]} onPress={handleCancelEdit}>
              <Text style={[styles.cancelEditButtonText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_cancel_edit_button')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.listCard, { backgroundColor: isDark ? '#111827' : theme.colors.white, borderColor: theme.colors.border }]}>
          <View style={styles.listHeaderRow}>
            <Text style={[styles.listTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('reminders_upcoming')}</Text>
            <View style={[styles.countBadge, { backgroundColor: theme.colors.primary }] }>
              <Text style={[styles.countBadgeText, { fontFamily: theme.fonts.bodyFamily }]}>{reminders.length}</Text>
            </View>
          </View>

          {reminders.length > 0 ? (
            reminders.map((reminder) => (
              <View key={reminder.id} style={[styles.listItem, { backgroundColor: isDark ? '#1E293B' : colors.gray50 }]}>
                <View style={styles.listTextContainer}>
                  <Text style={[styles.listItemTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{reminder.title}</Text>
                  <Text style={[styles.listItemMeta, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                    {new Date(reminder.dateTime).toLocaleDateString(locale)} •{' '}
                    {new Date(reminder.dateTime).toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.listActions}>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(reminder.id, reminder.notificationId, reminder.calendarEventId)}
                  >
                    <Text style={styles.deleteButtonText}>{t('reminders_delete_button')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editButton} onPress={() => handleEditPress(reminder)}>
                    <Text style={styles.editButtonText}>{t('reminders_edit_button')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>{t('reminders_upcoming')}</Text>
              <Text style={styles.emptyStateText}>{t('calendar_empty')}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={dateTime}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChangeDate}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={dateTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChangeTime}
        />
      )}
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
    width: 100,
  },
  headerTitle: {
    ...commonStyles.heading1,
    fontSize: 20,
  },
  headerRight: {
    width: 100,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray100,
    ...shadows.md,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  formTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  editingPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  editingPillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.white,
  },
  editingLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.gray700,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    backgroundColor: colors.gray50,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray50,
    minHeight: 52,
    justifyContent: 'center',
  },
  pickerText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  saveButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    ...shadows.sm,
  },
  saveButtonText: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.md,
  },
  cancelEditButton: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray300,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  cancelEditButtonText: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.md,
  },
  listCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray100,
    ...shadows.md,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  listTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  countBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  countBadgeText: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray50,
    marginBottom: spacing.sm,
  },
  listTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  listItemTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  listItemMeta: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  listActions: {
    alignItems: 'stretch',
    gap: spacing.xs,
    minWidth: 92,
  },
  deleteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray200,
    borderRadius: borderRadius.full,
  },
  deleteButtonText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    textAlign: 'center',
    fontWeight: typography.fontWeights.semibold,
  },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
  },
  editButtonText: {
    color: colors.white,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
  },
  emptyStateTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textLight,
  },
});
