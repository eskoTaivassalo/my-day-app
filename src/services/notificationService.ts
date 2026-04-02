import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

export interface NotificationSettings {
  enabled: boolean;
  dailyReminderTime: string; // Format: "HH:MM"
  reminderDays: number[]; // 0-6 (Sunday-Saturday)
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  dailyReminderTime: '20:00', // 8 PM default
  reminderDays: [0, 1, 2, 3, 4, 5, 6], // All days
};

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions from user
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily-reminders', {
        name: 'Päivittäiset muistutukset',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B6B',
      });
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

/**
 * Get notification settings from storage
 */
export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const settings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (settings) {
      return JSON.parse(settings);
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return DEFAULT_SETTINGS;
  }
};

/**
 * Save notification settings to storage
 */
export const saveNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
};

/**
 * Schedule daily reminder notifications
 */
export const scheduleDailyReminders = async (settings: NotificationSettings): Promise<void> => {
  try {
    // Cancel all existing scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (!settings.enabled) {
      return;
    }

    // Parse time
    const [hours, minutes] = settings.dailyReminderTime.split(':').map(Number);

    // For Android, we need to use daily trigger instead of calendar
    // Schedule a single daily notification that repeats
    if (Platform.OS === 'android') {
      // Calculate seconds until the target time today (or tomorrow if time has passed)
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(hours, minutes, 0, 0);
      
      // If target time has passed today, schedule for tomorrow
      if (targetTime <= now) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      const secondsUntilTarget = Math.floor((targetTime.getTime() - now.getTime()) / 1000);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📝 Muistathan kirjoittaa päiväkirjasi!',
          body: 'Tallenna tämän päivän muistot ja ajatukset.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'daily_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
        },
      });
    } else {
      // iOS can use calendar trigger with weekdays
      for (const dayOfWeek of settings.reminderDays) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📝 Muistathan kirjoittaa päiväkirjasi!',
            body: 'Tallenna tämän päivän muistot ja ajatukset.',
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            data: { type: 'daily_reminder' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour: hours,
            minute: minutes,
            weekday: dayOfWeek === 0 ? 1 : dayOfWeek + 1, // Expo uses 1-7 (Sun-Sat), we use 0-6
            repeats: true,
          },
        });
      }
    }

    console.log('Daily reminders scheduled successfully');
  } catch (error) {
    console.error('Error scheduling daily reminders:', error);
  }
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('All notifications cancelled');
  } catch (error) {
    console.error('Error cancelling notifications:', error);
  }
};

/**
 * Get all scheduled notifications (for debugging)
 */
export const getScheduledNotifications = async () => {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    console.log('Scheduled notifications:', notifications);
    return notifications;
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};

/**
 * Initialize notifications on app start
 */
export const initializeNotifications = async (): Promise<void> => {
  try {
    const hasPermission = await requestNotificationPermissions();
    
    if (hasPermission) {
      const settings = await getNotificationSettings();
      await scheduleDailyReminders(settings);
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
};
