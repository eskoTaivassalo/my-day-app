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
import * as Notifications from 'expo-notifications';

export default function RemindersScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dateTime, setDateTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [scheduledCount, setScheduledCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadReminders = async () => {
    const data = await getReminders();
    const now = Date.now();
    const upcoming = data.filter((reminder) => new Date(reminder.dateTime).getTime() >= now);
    setReminders(upcoming);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReminders();
    await loadNotificationDebug();
    setRefreshing(false);
  };

  useEffect(() => {
    loadReminders();
    loadNotificationDebug();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadReminders();
      loadNotificationDebug();
    }, [])
  );

  const loadNotificationDebug = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      setScheduledCount(scheduled.length);
    } catch (error) {
      console.error('Error loading notification debug info:', error);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Puuttuu otsikko', 'Lisää muistutukselle otsikko.');
      return;
    }

    if (dateTime.getTime() <= Date.now()) {
      Alert.alert('Aika on mennyt', 'Valitse tuleva päivämäärä ja kellonaika.');
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
      id: `${Date.now()}`,
      title: title.trim(),
      dateTime: dateTime.toISOString(),
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      notificationId: notificationId || undefined,
      calendarEventId: calendarEventId || undefined,
    };

    await saveReminder(reminder);
    setTitle('');
    setNotes('');
    setDateTime(new Date());
    await loadReminders();
    await loadNotificationDebug();

    Alert.alert(
      'Muistutus tallennettu',
      notificationId
        ? 'Muistutus lisätty ja ilmoitus ajastettu.'
        : 'Muistutus lisätty, mutta ilmoitusta ei ajastettu.'
    );
  };

  const handleDelete = (id: string, notificationId?: string, calendarEventId?: string) => {
    Alert.alert('Poista muistutus', 'Haluatko poistaa muistutuksen?', [
      { text: 'Peruuta', style: 'cancel' },
      {
        text: 'Poista',
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(id, notificationId, calendarEventId);
          await loadReminders();
          await loadNotificationDebug();
        },
      },
    ]);
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

  const formattedDate = dateTime.toLocaleDateString('fi-FI', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedTime = dateTime.toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Takaisin</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uusi muistutus</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.debugCard}>
          <Text style={styles.debugTitle}>Ilmoitusten tila</Text>
          <Text style={styles.debugText}>
            Lupa: {permissionStatus === 'granted' ? 'myönnetty' : 'ei myönnetty'}
          </Text>
          <Text style={styles.debugText}>Ajastettuja ilmoituksia: {scheduledCount}</Text>
          <TouchableOpacity style={styles.debugButton} onPress={loadNotificationDebug}>
            <Text style={styles.debugButtonText}>Päivitä tila</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Otsikko</Text>
          <TextInput
            style={styles.input}
            placeholder="Esim. Soita hammaslääkäri"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Päivämäärä</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickerText}>{formattedDate}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Kellonaika</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickerText}>{formattedTime}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Muistiinpanot</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Lisätiedot (valinnainen)"
            placeholderTextColor={colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Tallenna muistutus</Text>
          </TouchableOpacity>
        </View>

        {reminders.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Tulevat muistutukset</Text>
            {reminders.map((reminder) => (
              <View key={reminder.id} style={styles.listItem}>
                <View style={styles.listTextContainer}>
                  <Text style={styles.listItemTitle}>{reminder.title}</Text>
                  <Text style={styles.listItemMeta}>
                    {new Date(reminder.dateTime).toLocaleDateString('fi-FI')} •{' '}
                    {new Date(reminder.dateTime).toLocaleTimeString('fi-FI', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(reminder.id, reminder.notificationId, reminder.calendarEventId)}
                >
                  <Text style={styles.deleteButtonText}>Poista</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
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
    padding: spacing.lg,
    gap: spacing.lg,
  },
  debugCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  debugTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  debugText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  debugButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.gray100,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  debugButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    backgroundColor: colors.gray50,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray50,
  },
  pickerText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  saveButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.md,
  },
  listCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  listTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  listTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  listItemTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  listItemMeta: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  deleteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.full,
  },
  deleteButtonText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
  },
});
