import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Calendar from 'expo-calendar';
import { colors, spacing, borderRadius, typography, shadows, commonStyles } from '../theme/theme';
import {
  getNotificationSettings,
  saveNotificationSettings,
  scheduleDailyReminders,
  requestNotificationPermissions,
  NotificationSettings,
} from '../services/notificationService';
import {
  getShowTodayRemindersAlert,
  setShowTodayRemindersAlert,
  getCalendarSyncEnabled,
  setCalendarSyncEnabled,
  getSelectedCalendarId,
  setSelectedCalendarId,
} from '../services/reminderService';
import { useAuth } from '../contexts/AuthContext';
import { getEntries } from '../services/diaryService';

export default function SettingsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    enabled: true,
    dailyReminderTime: '20:00',
    reminderDays: [0, 1, 2, 3, 4, 5, 6],
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showTodayReminders, setShowTodayReminders] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [calendarSyncEnabled, setCalendarSyncEnabledState] = useState(false);
  const [calendarList, setCalendarList] = useState<Calendar.Calendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarIdState] = useState<string | null>(null);

  useEffect(() => {
    loadNotificationSettings();
    loadReminderSettings();
    loadCalendarSettings();
  }, []);

  const loadNotificationSettings = async () => {
    try {
      const settings = await getNotificationSettings();
      setNotificationSettings(settings);
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  };

  const loadReminderSettings = async () => {
    const enabled = await getShowTodayRemindersAlert();
    setShowTodayReminders(enabled);
  };

  const loadCalendarSettings = async () => {
    const enabled = await getCalendarSyncEnabled();
    setCalendarSyncEnabledState(enabled);
    const calendarId = await getSelectedCalendarId();
    setSelectedCalendarIdState(calendarId);
    if (enabled) {
      await loadCalendars();
    }
  };

  const loadCalendars = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = calendars.filter((cal) => cal.allowsModifications);
    setCalendarList(writable);
  };

  const toggleCalendarSync = async (enabled: boolean) => {
    if (enabled) {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Lupa vaaditaan', 'Kalenteriin tallentaminen vaatii luvan.');
        return;
      }
      await loadCalendars();
    }

    setCalendarSyncEnabledState(enabled);
    await setCalendarSyncEnabled(enabled);
  };

  const toggleNotifications = async (enabled: boolean) => {
    try {
      if (enabled) {
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          Alert.alert(
            'Lupa vaaditaan',
            'Ilmoitusten käyttö vaatii luvan. Voit myöntää luvan laitteen asetuksista.'
          );
          return;
        }
      }

      const newSettings = { ...notificationSettings, enabled };
      setNotificationSettings(newSettings);
      await saveNotificationSettings(newSettings);
      await scheduleDailyReminders(newSettings);

      Alert.alert(
        'Asetukset tallennettu',
        enabled
          ? `Päivittäinen muistutus ajastettu klo ${notificationSettings.dailyReminderTime}`
          : 'Ilmoitukset poistettu käytöstä'
      );
    } catch (error) {
      console.error('Error toggling notifications:', error);
      Alert.alert('Virhe', 'Ilmoitusasetusten päivitys epäonnistui');
    }
  };

  const onChangeTime = async (_event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (!selectedTime) return;

    const hours = String(selectedTime.getHours()).padStart(2, '0');
    const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
    const dailyReminderTime = `${hours}:${minutes}`;

    const newSettings = { ...notificationSettings, dailyReminderTime };
    setNotificationSettings(newSettings);
    await saveNotificationSettings(newSettings);

    if (newSettings.enabled) {
      await scheduleDailyReminders(newSettings);
    }
  };

  const handleExportEntries = async () => {
    if (!user) return;

    try {
      setBackupLoading(true);
      const entries = await getEntries(user.uid);
      const exportData = entries.map((entry) => ({
        ...entry,
        date: entry.date.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      }));

      const fileName = `myday_backup_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        dialogTitle: 'Vie merkinnät',
        mimeType: 'application/json',
      });
    } catch (error) {
      console.error('Error exporting entries:', error);
      Alert.alert('Virhe', 'Merkintöjen vienti epäonnistui.');
    } finally {
      setBackupLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Takaisin</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Asetukset</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ilmoitukset</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>🔔</Text>
              <View>
                <Text style={styles.settingTitle}>Päivittäiset muistutukset</Text>
                <Text style={styles.settingDescription}>
                  {notificationSettings.enabled
                    ? `Klo ${notificationSettings.dailyReminderTime}`
                    : 'Ei käytössä'}
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.enabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.borderLight, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <TouchableOpacity
            style={styles.timeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.timeButtonLabel}>Vaihda muistutusaika</Text>
            <Text style={styles.timeButtonValue}>{notificationSettings.dailyReminderTime}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Muistutukset</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📌</Text>
              <View>
                <Text style={styles.settingTitle}>Älä näytä muistutuksia</Text>
                <Text style={styles.settingDescription}>
                  Poistaa päivän muistutusten toastin
                </Text>
              </View>
            </View>
            <Switch
              value={!showTodayReminders}
              onValueChange={async (value) => {
                const enabled = !value;
                setShowTodayReminders(enabled);
                await setShowTodayRemindersAlert(enabled);
              }}
              trackColor={{ false: colors.borderLight, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kalenteri</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📅</Text>
              <View>
                <Text style={styles.settingTitle}>Tallenna muistutukset kalenteriin</Text>
                <Text style={styles.settingDescription}>
                  Lisää muistutukset laitteen kalenteriin
                </Text>
              </View>
            </View>
            <Switch
              value={calendarSyncEnabled}
              onValueChange={toggleCalendarSync}
              trackColor={{ false: colors.borderLight, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          {calendarSyncEnabled && calendarList.length > 0 && (
            <View style={styles.calendarList}>
              {calendarList.map((calendar) => (
                <TouchableOpacity
                  key={calendar.id}
                  style={styles.calendarRow}
                  onPress={async () => {
                    setSelectedCalendarIdState(calendar.id);
                    await setSelectedCalendarId(calendar.id);
                  }}
                >
                  <View style={styles.calendarInfo}>
                    <Text style={styles.calendarName}>{calendar.title}</Text>
                    <Text style={styles.calendarSource}>{calendar.source?.name}</Text>
                  </View>
                  <Text style={styles.calendarCheck}>
                    {selectedCalendarId === calendar.id ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Varmuuskopiointi</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExportEntries}
            disabled={backupLoading}
          >
            <Text style={styles.actionButtonText}>
              {backupLoading ? 'Viedään merkintöjä...' : 'Vie merkinnät (JSON)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('ImageLibrary')}
          >
            <Text style={styles.secondaryButtonText}>Valitse kuvat Kuvapankista</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('VideoLibrary')}
          >
            <Text style={styles.secondaryButtonText}>Valitse videot Videopankista</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showTimePicker && (
        <DateTimePicker
          value={new Date()}
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
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    fontSize: 22,
    marginRight: spacing.md,
  },
  settingTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  settingDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timeButton: {
    marginTop: spacing.md,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeButtonLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: typography.fontWeights.semibold,
  },
  timeButtonValue: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  actionButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  actionButtonText: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.sm,
  },
  secondaryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.gray100,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.sm,
  },
  calendarList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  calendarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
  },
  calendarInfo: {
    flex: 1,
  },
  calendarName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  calendarSource: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  calendarCheck: {
    fontSize: typography.fontSizes.lg,
    color: colors.primary,
    width: 24,
    textAlign: 'center',
  },
});
