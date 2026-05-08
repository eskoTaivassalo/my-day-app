import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Platform, Modal, TextInput } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
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
import {
  getEntriesFast,
} from '../services/diaryService';
import { useTheme, ThemeColors } from '../contexts/ThemeContext';
import { useAppLock } from '../contexts/AppLockContext';

const CUSTOM_STUDIO_COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: 'primary', label: 'Paavari (painikkeet)' },
  { key: 'primaryLight', label: 'Paavari vaalea' },
  { key: 'primaryDark', label: 'Paavari tumma' },
  { key: 'secondary', label: 'Toissijainen vari' },
  { key: 'accent', label: 'Kuvakkeet / kuva-aksentti' },
  { key: 'text', label: 'Teksti paa' },
  { key: 'textSecondary', label: 'Teksti toissijainen' },
  { key: 'background', label: 'Tausta paa' },
  { key: 'backgroundLight', label: 'Tausta vaalea' },
  { key: 'border', label: 'Reunaviiva' },
  { key: 'white', label: 'Kortit / valkoinen pinta' },
];

const RGB_STEPS = [0, 51, 102, 153, 204, 255];

export default function SettingsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const {
    theme,
    activeThemeId,
    themePresets,
    setActiveTheme,
    customThemeDraft,
    updateCustomColors,
    setCustomFontOption,
    fontOptions,
  } = useTheme();
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

  const { pinEnabled, biometricsEnabled, biometricsAvailable, enablePin, disablePin, enableBiometrics } = useAppLock();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [selectedCustomColorKey, setSelectedCustomColorKey] = useState<keyof ThemeColors>('primary');
  const pinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadNotificationSettings();
    loadReminderSettings();
    loadCalendarSettings();
  }, [user]);

  const clampRgb = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
      return { r: 0, g: 0, b: 0 };
    }

    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };

  const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
    const toHex = (n: number) => clampRgb(n).toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const updateRgbChannel = (channel: 'r' | 'g' | 'b', value: number) => {
    const currentHex = customThemeDraft.colors[selectedCustomColorKey] || '#000000';
    const currentRgb = hexToRgb(currentHex);
    const nextRgb = { ...currentRgb, [channel]: clampRgb(value) };
    void updateCustomColors({ [selectedCustomColorKey]: rgbToHex(nextRgb) } as Partial<ThemeColors>);
  };

  const loadNotificationSettings = async () => {
    try {
      const settings = await getNotificationSettings();
      setNotificationSettings(settings);
    } catch {
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
        Alert.alert(t('common_permission_required'), t('settings_calendar_permission'));
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
            t('common_permission_required'),
            t('settings_notifications_permission'),
          );
          return;
        }
      }

      const newSettings = { ...notificationSettings, enabled };
      setNotificationSettings(newSettings);
      await saveNotificationSettings(newSettings);
      await scheduleDailyReminders(newSettings);

      Alert.alert(
        t('settings_notifications_saved'),
        enabled
          ? t('settings_reminder_scheduled', { time: notificationSettings.dailyReminderTime })
          : t('settings_notifications_disabled_msg'),
      );
    } catch {
      Alert.alert(t('common_error'), t('settings_notifications_failed'));
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

  const handleTogglePin = () => {
    if (pinEnabled) {
      Alert.alert(
        t('settings_lock_disable_title'),
        t('settings_lock_disable_msg'),
        [
          { text: t('common_cancel'), style: 'cancel' },
          { text: t('common_yes'), style: 'destructive', onPress: async () => { await disablePin(); } },
        ]
      );
    } else {
      setPinStep('enter');
      setNewPin('');
      setConfirmPin('');
      setShowPinModal(true);
      setTimeout(() => pinInputRef.current?.focus(), 300);
    }
  };

  const handlePinModalConfirm = async () => {
    if (savingPin) return;

    if (pinStep === 'enter') {
      if (newPin.length !== 6) {
        Alert.alert(t('common_error'), t('settings_lock_pin_length'));
        return;
      }
      setPinStep('confirm');
      setConfirmPin('');
      setTimeout(() => pinInputRef.current?.focus(), 100);
    } else {
      if (confirmPin !== newPin) {
        Alert.alert(t('common_error'), t('settings_lock_pin_mismatch'));
        setConfirmPin('');
        return;
      }

      try {
        setSavingPin(true);
        await enablePin(newPin);
        setShowPinModal(false);
        setPinStep('enter');
        setNewPin('');
        setConfirmPin('');
        Alert.alert(t('settings_lock_enabled_title'), t('settings_lock_enabled_msg'));
      } catch (error) {
        console.error('PIN setup failed:', error);
        Alert.alert(t('common_error'), t('settings_lock_save_failed'));
      } finally {
        setSavingPin(false);
      }
    }
  };

  const handleExportEntries = async () => {
    if (!user) return;

    try {
      setBackupLoading(true);
      const entries = await getEntriesFast(user.uid);
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
        dialogTitle: t('settings_export_share_title'),
        mimeType: 'application/json',
      });
    } catch {
      Alert.alert(t('common_error'), t('settings_export_failed'));
    } finally {
      setBackupLoading(false);
    }
  };


  const selectedFontOptionId =
    fontOptions.find(
      (option) =>
        option.headingFamily === customThemeDraft.fonts.headingFamily &&
        option.bodyFamily === customThemeDraft.fonts.bodyFamily,
    )?.id || 'system';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.backgroundLight }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border }]}> 
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: theme.colors.primary }]}>{t('common_back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>
          {t('settings_header')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('settings_notifications')}</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>🔔</Text>
              <View>
                <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('settings_daily_reminder')}</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  {notificationSettings.enabled
                    ? t('settings_time_enabled', { time: notificationSettings.dailyReminderTime })
                    : t('settings_time_disabled')}
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.enabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
            />
          </View>

          <TouchableOpacity
            style={[styles.timeButton, { backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }]}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={[styles.timeButtonLabel, { color: theme.colors.text }]}>{t('settings_change_time')}</Text>
            <Text style={[styles.timeButtonValue, { color: theme.colors.textSecondary }]}>{notificationSettings.dailyReminderTime}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('settings_reminders')}</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📌</Text>
              <View>
                <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('settings_no_reminder_toast')}</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  {t('settings_no_reminder_toast_desc')}
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
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('settings_calendar_section')}</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📅</Text>
              <View>
                <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('settings_calendar_sync')}</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  {t('settings_calendar_sync_desc')}
                </Text>
              </View>
            </View>
            <Switch
              value={calendarSyncEnabled}
              onValueChange={toggleCalendarSync}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
            />
          </View>

          {calendarSyncEnabled && calendarList.length > 0 && (
            <View style={styles.calendarList}>
              {calendarList.map((calendar) => (
                <TouchableOpacity
                  key={calendar.id}
                  style={[styles.calendarRow, { backgroundColor: theme.colors.backgroundLight }]}
                  onPress={async () => {
                    setSelectedCalendarIdState(calendar.id);
                    await setSelectedCalendarId(calendar.id);
                  }}
                >
                  <View style={styles.calendarInfo}>
                    <Text style={[styles.calendarName, { color: theme.colors.text }]}>{calendar.title}</Text>
                    <Text style={[styles.calendarSource, { color: theme.colors.textSecondary }]}>{calendar.source?.name}</Text>
                  </View>
                  <Text style={[styles.calendarCheck, { color: theme.colors.primary }]}>
                    {selectedCalendarId === calendar.id ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('settings_language_section')}</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>🌐</Text>
              <View>
                <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('settings_language_title')}</Text>
              </View>
            </View>
          </View>
          <View style={styles.languageButtons}>
            {(['fi', 'en', 'sv'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.langButton, language === lang && styles.langButtonActive, language === lang ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary } : { backgroundColor: theme.colors.backgroundLight, borderColor: theme.colors.border }]}
                onPress={() => setLanguage(lang)}
              >
                <Text style={[styles.langButtonText, language === lang && styles.langButtonTextActive, language === lang ? { color: theme.colors.white } : { color: theme.colors.text }]}>
                  {t(lang === 'fi' ? 'settings_language_fi' : lang === 'en' ? 'settings_language_en' : 'settings_language_sv')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Teema</Text>
          <View style={styles.themePresetList}>
            {themePresets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.themePresetButton,
                  activeThemeId === preset.id && styles.themePresetButtonActive,
                  activeThemeId === preset.id && { borderColor: theme.colors.primary },
                ]}
                onPress={() => setActiveTheme(preset.id)}
              >
                <View style={styles.themePresetHeader}>
                  <View style={styles.themeColorDots}>
                    <View style={[styles.themeColorDot, { backgroundColor: preset.colors.primary }]} />
                    <View style={[styles.themeColorDot, { backgroundColor: preset.colors.secondary }]} />
                    <View style={[styles.themeColorDot, { backgroundColor: preset.colors.accent }]} />
                  </View>
                  {activeThemeId === preset.id && <Text style={[styles.themePresetCheck, { color: theme.colors.primary }]}>✓</Text>}
                </View>
                <Text style={[styles.themePresetTitle, { color: theme.colors.text }]}>{preset.name}</Text>
                <Text style={[styles.themePresetDescription, { color: theme.colors.textSecondary }]}>{preset.descriptions?.[language] ?? preset.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeThemeId === 'custom' && (
            <View style={styles.customThemePanel}>
              <Text style={[styles.customThemeLabel, { color: theme.colors.text }]}>Koko varipaletti (RGB)</Text>
              {CUSTOM_STUDIO_COLOR_FIELDS.map((field) => {
                const value = customThemeDraft.colors[field.key] || '#000000';
                const rgb = hexToRgb(value);
                const isSelected = selectedCustomColorKey === field.key;

                return (
                  <TouchableOpacity
                    key={field.key}
                    style={[
                      styles.customColorRow,
                      isSelected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.backgroundLight },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setSelectedCustomColorKey(field.key)}
                  >
                    <View style={styles.customColorMeta}>
                      <View
                        style={[
                          styles.customColorPreview,
                          {
                            backgroundColor: value,
                            borderColor: theme.colors.border,
                          },
                        ]}
                      />
                      <Text style={[styles.customColorLabel, { color: theme.colors.text }]}>{field.label}</Text>
                    </View>
                    <Text style={[styles.customColorRgbText, { color: theme.colors.textSecondary }]}>
                      rgb({rgb.r}, {rgb.g}, {rgb.b})
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <View style={[styles.rgbPickerPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundLight }]}>
                <Text style={[styles.customThemeLabel, { color: theme.colors.text, marginTop: 0 }]}>RGB-valitsin</Text>
                <Text style={[styles.rgbSelectedLabel, { color: theme.colors.textSecondary }]}>
                  {CUSTOM_STUDIO_COLOR_FIELDS.find((f) => f.key === selectedCustomColorKey)?.label}
                </Text>

                {(['r', 'g', 'b'] as const).map((channel) => {
                  const currentHex = customThemeDraft.colors[selectedCustomColorKey] || '#000000';
                  const currentRgb = hexToRgb(currentHex);
                  const currentValue = currentRgb[channel];
                  const channelLabel = channel.toUpperCase();

                  return (
                    <View key={channel} style={styles.rgbChannelBlock}>
                      <Text style={[styles.rgbChannelTitle, { color: theme.colors.text }]}>Kanal {channelLabel}: {currentValue}</Text>
                      <View style={styles.rgbSwatchRow}>
                        {RGB_STEPS.map((step) => {
                          const previewRgb = {
                            ...currentRgb,
                            [channel]: step,
                          };
                          const previewHex = rgbToHex(previewRgb);
                          const isActive = currentValue === step;

                          return (
                            <TouchableOpacity
                              key={`${channel}-${step}`}
                              style={[
                                styles.rgbSwatch,
                                {
                                  backgroundColor: previewHex,
                                  borderColor: isActive ? theme.colors.primary : theme.colors.border,
                                  borderWidth: isActive ? 2 : 1,
                                },
                              ]}
                              onPress={() => updateRgbChannel(channel, step)}
                              activeOpacity={0.85}
                            />
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.customThemeLabel, { color: theme.colors.text }]}>Tekstifontti</Text>
              <View style={styles.fontOptionRow}>
                {fontOptions.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.fontOptionButton,
                      selectedFontOptionId === option.id && styles.fontOptionButtonActive,
                    ]}
                    onPress={() => setCustomFontOption(option.id)}
                  >
                    <Text style={[styles.fontOptionText, { fontFamily: option.bodyFamily, color: theme.colors.text }]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* App Lock */}
        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('settings_lock_section')}</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>🔒</Text>
              <View>
                <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('settings_lock_pin')}</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  {t('settings_lock_pin_desc')}
                </Text>
              </View>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={handleTogglePin}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
            />
          </View>

          {pinEnabled && biometricsAvailable && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingIcon}>👆</Text>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('settings_lock_biometrics')}</Text>
                  <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                    {t('settings_lock_biometrics_desc')}
                  </Text>
                </View>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={enableBiometrics}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor={theme.colors.white}
              />
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('settings_backup')}</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExportEntries}
            disabled={backupLoading}
          >
            <Text style={styles.actionButtonText}>
              {backupLoading ? t('settings_exporting') : t('settings_export_button')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.colors.backgroundLight }]}
            onPress={() => navigation.navigate('ImageLibrary')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>{t('settings_image_library')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.colors.backgroundLight }]}
            onPress={() => navigation.navigate('VideoLibrary')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>{t('settings_video_library')}</Text>
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

      {/* PIN setup modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>
              {pinStep === 'enter' ? t('settings_lock_pin_enter') : t('settings_lock_pin_confirm')}
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
              {t('settings_lock_pin_length_hint')}
            </Text>
            <TextInput
              ref={pinInputRef}
              style={[styles.pinInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundLight }]}
              value={pinStep === 'enter' ? newPin : confirmPin}
              onChangeText={(v) => {
                const digits = v.replace(/[^0-9]/g, '').slice(0, 6);

                if (pinStep === 'enter') {
                  setNewPin(digits);
                  if (digits.length === 6) {
                    setTimeout(() => {
                      setPinStep('confirm');
                      setConfirmPin('');
                      setTimeout(() => pinInputRef.current?.focus(), 60);
                    }, 80);
                  }
                } else {
                  setConfirmPin(digits);
                }
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  if (savingPin) return;
                  setShowPinModal(false);
                  setPinStep('enter');
                  setNewPin('');
                  setConfirmPin('');
                }}
              >
                <Text style={[styles.modalCancelText, { color: theme.colors.textSecondary }]}>{t('common_cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: (pinStep === 'enter' ? newPin.length === 6 : confirmPin.length === 6) && !savingPin ? 1 : 0.6,
                  },
                ]}
                disabled={savingPin || (pinStep === 'enter' ? newPin.length !== 6 : confirmPin.length !== 6)}
                onPress={handlePinModalConfirm}
              >
                <Text style={styles.modalConfirmText}>
                  {savingPin ? t('common_saving') : pinStep === 'enter' ? t('common_continue') : t('common_save')}
                </Text>
              </TouchableOpacity>
            </View>
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
  languageButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  langButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  langButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  langButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  langButtonTextActive: {
    color: colors.white,
  },
  themePresetList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  themePresetButton: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    backgroundColor: colors.gray50,
  },
  themePresetButtonActive: {
    backgroundColor: colors.white,
  },
  themePresetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  themeColorDots: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  themeColorDot: {
    width: 14,
    height: 14,
    borderRadius: borderRadius.full,
  },
  themePresetCheck: {
    color: colors.primary,
    fontWeight: typography.fontWeights.bold,
  },
  themePresetTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  themePresetDescription: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customThemePanel: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    gap: spacing.sm,
  },
  customThemeLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  customColorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  customColorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  customColorPreview: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  customColorLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    flex: 1,
  },
  customColorRgbText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  rgbPickerPanel: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  rgbSelectedLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  rgbChannelBlock: {
    gap: spacing.xs,
  },
  rgbChannelTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  rgbSwatchRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  rgbSwatch: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
  },
  colorOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.white,
  },
  colorOptionActive: {
    borderColor: colors.black,
  },
  fontOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fontOptionButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  fontOptionButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  fontOptionText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: typography.fontSizes.sm,
    textAlign: 'center',
  },
  pinInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  modalConfirmBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
});
