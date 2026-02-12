import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
import { requestNotificationPermissions } from './notificationService';

const REMINDERS_KEY = '@reminders';
const TODAY_ALERT_KEY = '@today_reminders_alert_date';
const SHOW_TODAY_ALERT_KEY = '@show_today_reminders_alert';
const CALENDAR_SYNC_KEY = '@calendar_sync_enabled';
const CALENDAR_ID_KEY = '@calendar_selected_id';

export interface Reminder {
  id: string;
  title: string;
  dateTime: string; // ISO string
  notes?: string;
  createdAt: string; // ISO string
  notificationId?: string;
  calendarEventId?: string;
}

export const getReminders = async (): Promise<Reminder[]> => {
  try {
    const data = await AsyncStorage.getItem(REMINDERS_KEY);
    if (!data) return [];
    const reminders: Reminder[] = JSON.parse(data);
    return reminders.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  } catch (error) {
    console.error('Error loading reminders:', error);
    return [];
  }
};

export const saveReminder = async (reminder: Reminder): Promise<void> => {
  try {
    const reminders = await getReminders();
    const next = [reminder, ...reminders];
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Error saving reminder:', error);
  }
};

export const deleteReminder = async (
  id: string,
  notificationId?: string,
  calendarEventId?: string
): Promise<void> => {
  try {
    if (notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch (cancelError) {
        console.error('Error cancelling reminder notification:', cancelError);
      }
    }

    if (calendarEventId) {
      try {
        await Calendar.deleteEventAsync(calendarEventId);
      } catch (calendarError) {
        console.error('Error deleting calendar event:', calendarError);
      }
    }
    const reminders = await getReminders();
    const next = reminders.filter((reminder) => reminder.id !== id);
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Error deleting reminder:', error);
  }
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getRemindersForDate = async (date: Date): Promise<Reminder[]> => {
  const reminders = await getReminders();
  const key = toLocalDateKey(date);

  return reminders
    .filter((reminder) => toLocalDateKey(new Date(reminder.dateTime)) === key)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
};

export const getTodayReminders = async (): Promise<Reminder[]> => {
  const reminders = await getRemindersForDate(new Date());
  const now = Date.now();
  return reminders.filter((reminder) => new Date(reminder.dateTime).getTime() >= now);
};

export const getTodayRemindersSummary = async (): Promise<
  | { dateKey: string; message: string; count: number }
  | null
> => {
  const reminders = await getTodayReminders();

  if (reminders.length === 0) {
    return null;
  }

  const message = reminders
    .map((reminder) => {
      const time = new Date(reminder.dateTime).toLocaleTimeString('fi-FI', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `• ${time} — ${reminder.title}`;
    })
    .join('\n');

  return {
    dateKey: toLocalDateKey(new Date()),
    message,
    count: reminders.length,
  };
};

export const getLastReminderAlertDate = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(TODAY_ALERT_KEY);
  } catch (error) {
    console.error('Error getting last reminder alert date:', error);
    return null;
  }
};

export const setLastReminderAlertDate = async (dateKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(TODAY_ALERT_KEY, dateKey);
  } catch (error) {
    console.error('Error setting last reminder alert date:', error);
  }
};

export const getTodayDateKey = () => toLocalDateKey(new Date());

export const getShowTodayRemindersAlert = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(SHOW_TODAY_ALERT_KEY);
    if (value === null) {
      return true;
    }
    return value === 'true';
  } catch (error) {
    console.error('Error getting show today reminders setting:', error);
    return true;
  }
};

export const setShowTodayRemindersAlert = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(SHOW_TODAY_ALERT_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('Error setting show today reminders setting:', error);
  }
};

export const getCalendarSyncEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(CALENDAR_SYNC_KEY);
    return value === 'true';
  } catch (error) {
    console.error('Error getting calendar sync setting:', error);
    return false;
  }
};

export const setCalendarSyncEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(CALENDAR_SYNC_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('Error setting calendar sync setting:', error);
  }
};

export const getSelectedCalendarId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(CALENDAR_ID_KEY);
  } catch (error) {
    console.error('Error getting selected calendar id:', error);
    return null;
  }
};

export const setSelectedCalendarId = async (calendarId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(CALENDAR_ID_KEY, calendarId);
  } catch (error) {
    console.error('Error setting selected calendar id:', error);
  }
};

export const createCalendarEvent = async (
  calendarId: string,
  title: string,
  dateTime: Date,
  notes?: string
): Promise<string | null> => {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const startDate = dateTime;
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    const eventId = await Calendar.createEventAsync(calendarId, {
      title,
      startDate,
      endDate,
      notes,
    });

    return eventId;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return null;
  }
};

export const scheduleReminderNotification = async (
  title: string,
  dateTime: Date
): Promise<string | null> => {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    if (dateTime.getTime() <= Date.now()) {
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Muistutus',
        body: title,
        sound: true,
        data: { type: 'reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dateTime,
      },
    });

    return notificationId;
  } catch (error) {
    console.error('Error scheduling reminder notification:', error);
    return null;
  }
};
