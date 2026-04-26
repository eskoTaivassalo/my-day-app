import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DiaryEntry } from '../types/DiaryEntry';
import { Document } from '../types/Document';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getLocaleFromLanguage } from '../i18n/locale';
import { getEntriesFast } from '../services/diaryService';
import { getDocuments } from '../services/documentService';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  hasEntry: boolean;
  hasDocument: boolean;
}

export default function CalendarScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme.id === 'midnight';
  const locale = getLocaleFromLanguage(language);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const loadRequestIdRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const requestId = ++loadRequestIdRef.current;
    
    try {
      setLoading(true);
      const [fetchedEntries, fetchedDocuments] = await Promise.all([
        getEntriesFast(user.uid),
        getDocuments(user.uid),
      ]);
      if (requestId === loadRequestIdRef.current) {
        setEntries(fetchedEntries);
        setDocuments(fetchedDocuments);
      }
    } catch {
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
      loadInFlightRef.current = false;
    }
  }, [user]);

  // Ladataan entryt uudelleen kun palataan tähän screeniin
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadEntries();
      });

      return () => {
        task.cancel();
      };
    }, [loadEntries])
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    entries.forEach((entry) => {
      const dateKey = new Date(entry.date).toISOString().slice(0, 10);
      const current = map.get(dateKey);
      if (current) {
        current.push(entry);
      } else {
        map.set(dateKey, [entry]);
      }
    });
    return map;
  }, [entries]);

  const documentsByDate = useMemo(() => {
    const map = new Map<string, Document[]>();
    documents.forEach((doc) => {
      const dateKey = new Date(doc.date).toISOString().slice(0, 10);
      const current = map.get(dateKey);
      if (current) {
        current.push(doc);
      } else {
        map.set(dateKey, [doc]);
      }
    });
    return map;
  }, [documents]);

  useEffect(() => {
    generateCalendar();
  }, [currentDate, entries, documents]);

  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Days from previous month
    const prevMonthLastDay = new Date(year, month, 0);
    const daysFromPrevMonth = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

    const days: CalendarDay[] = [];

    // Previous month days
    for (let i = daysFromPrevMonth; i > 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay.getDate() - i + 1);
      days.push({
        date,
        isCurrentMonth: false,
        hasEntry: hasEntryOnDate(date),
        hasDocument: hasDocumentOnDate(date),
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
        hasEntry: hasEntryOnDate(date),
        hasDocument: hasDocumentOnDate(date),
      });
    }

    // Next month days to fill the grid
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        hasEntry: hasEntryOnDate(date),
        hasDocument: hasDocumentOnDate(date),
      });
    }

    setCalendarDays(days);
  };

  const hasEntryOnDate = (date: Date): boolean => {
    return getEntriesForDate(date).length > 0;
  };

  const getEntriesForDate = (date: Date): DiaryEntry[] => {
    const dateKey = new Date(date).toISOString().slice(0, 10);
    return entriesByDate.get(dateKey) || [];
  };

  const hasDocumentOnDate = (date: Date): boolean => {
    return getDocumentsForDate(date).length > 0;
  };

  const getDocumentsForDate = (date: Date): Document[] => {
    const dateKey = new Date(date).toISOString().slice(0, 10);
    return documentsByDate.get(dateKey) || [];
  };

  const isSameDay = (date1: Date, date2: Date): boolean => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const isToday = (date: Date): boolean => {
    return isSameDay(date, new Date());
  };

  const goToPreviousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
  };

  const handleDayPress = (day: CalendarDay) => {
    setSelectedDate(day.date);
  };

  const handleEntryPress = (entry: DiaryEntry) => {
    navigation.navigate('EntryDetail', { 
      entry: {
        ...entry,
        date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
        createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
        updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
      }
    });
  };

  const handleDocumentPress = (document: Document) => {
    navigation.navigate('DocumentDetail', { 
      document: {
        ...document,
        date: document.date.toISOString(),
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      }
    });
  };

  const monthNames = useMemo(() => [
    t('calendar_month_0'),
    t('calendar_month_1'),
    t('calendar_month_2'),
    t('calendar_month_3'),
    t('calendar_month_4'),
    t('calendar_month_5'),
    t('calendar_month_6'),
    t('calendar_month_7'),
    t('calendar_month_8'),
    t('calendar_month_9'),
    t('calendar_month_10'),
    t('calendar_month_11'),
  ], [t]);

  const dayNames = useMemo(() => [
    t('calendar_day_0'),
    t('calendar_day_1'),
    t('calendar_day_2'),
    t('calendar_day_3'),
    t('calendar_day_4'),
    t('calendar_day_5'),
    t('calendar_day_6'),
  ], [t]);

  const selectedEntries = useMemo(() => {
    if (!selectedDate) {
      return [];
    }
    return getEntriesForDate(selectedDate);
  }, [entries, selectedDate]);

  const selectedDocuments = useMemo(() => {
    if (!selectedDate) {
      return [];
    }
    return getDocumentsForDate(selectedDate);
  }, [documents, selectedDate]);

  const renderDay = (day: CalendarDay, index: number) => {
    const isSelected = selectedDate && isSameDay(day.date, selectedDate);
    const today = isToday(day.date);

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.dayCell,
          !day.isCurrentMonth && styles.otherMonthDay,
          isSelected && [styles.selectedDay, { backgroundColor: theme.colors.primary }],
          today && [styles.today, { backgroundColor: isDark ? '#1E293B' : '#E3F2FD' }],
        ]}
        onPress={() => handleDayPress(day)}
      >
        <Text
          style={[
            styles.dayText,
            { color: theme.colors.text },
            !day.isCurrentMonth && [styles.otherMonthText, { color: theme.colors.textSecondary }],
            isSelected && styles.selectedDayText,
            today && [styles.todayText, { color: isSelected ? '#fff' : theme.colors.primary }],
          ]}
        >
          {day.date.getDate()}
        </Text>
        <View style={styles.indicatorsContainer}>
          {day.hasEntry && (
            <View style={[styles.entryDot, { backgroundColor: theme.colors.accent }]} />
          )}
          {day.hasDocument && (
            <View style={[styles.documentDot, { backgroundColor: theme.colors.textSecondary }]} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('calendar_header')}</Text>
      </View>

      {/* Month Navigator */}
      <View style={[styles.monthNavigator, { backgroundColor: theme.colors.white }]}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <Text style={[styles.navButtonText, { color: theme.colors.primary }]}>‹</Text>
        </TouchableOpacity>

        <Text style={[styles.monthYearText, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </Text>

        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <Text style={[styles.navButtonText, { color: theme.colors.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day Names */}
      <View style={[styles.dayNamesRow, { backgroundColor: theme.colors.white }]}>
        {dayNames.map((name, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={[styles.dayNameText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{name}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <ScrollView style={styles.calendarScroll}>
        {loading && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.loadingBannerText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
              {t('common_loading')}
            </Text>
          </View>
        )}

        <View style={[styles.calendarGrid, { backgroundColor: theme.colors.white }]}>
          {calendarDays.map((day, index) => renderDay(day, index))}
        </View>

        {/* Selected Date Entries */}
        {selectedDate && (
          <View style={[styles.selectedDateSection, { backgroundColor: theme.colors.white }] }>
            <Text style={[styles.selectedDateTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }] }>
              {selectedDate.toLocaleDateString(locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>

            {selectedEntries.length > 0 ? (
              <View>
                <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('calendar_entries')}</Text>
                {selectedEntries.map((entry) => (
                  <TouchableOpacity
                    key={entry.id}
                    style={[
                      styles.entryItem,
                      {
                        backgroundColor: isDark ? '#111827' : theme.colors.white,
                        borderColor: theme.colors.border,
                      },
                    ]}
                    onPress={() => handleEntryPress(entry)}
                  >
                    <View style={styles.entryItemContent}>
                      <View style={styles.entryTextContainer}>
                        <Text style={[styles.entryItemTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{entry.title}</Text>
                        <Text style={[styles.entryItemPreview, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={2}>
                          {entry.content}
                        </Text>
                        <Text style={[styles.entryItemTime, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                          {new Date(entry.date).toLocaleTimeString(locale, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      {entry.images && entry.images.length > 0 && (
                        <Image
                          source={{ uri: entry.images[0] }}
                          style={[styles.entryThumbnail, { backgroundColor: isDark ? '#0B1220' : '#f0f0f0' }]}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {selectedDocuments.length > 0 ? (
              <View style={{ marginTop: selectedEntries.length > 0 ? 16 : 0 }}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('calendar_documents')}</Text>
                {selectedDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[
                      styles.documentItem,
                      {
                        backgroundColor: isDark ? '#111827' : '#F9FAFB',
                        borderColor: theme.colors.border,
                      },
                    ]}
                    onPress={() => handleDocumentPress(doc)}
                  >
                    <View style={styles.documentItemContent}>
                      <View style={styles.documentTextContainer}>
                        <Text style={[styles.documentItemTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{doc.title}</Text>
                        {doc.description && (
                          <Text style={[styles.documentItemDescription, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={2}>
                            {doc.description}
                          </Text>
                        )}
                        <View style={styles.documentMeta}>
                          <Text style={[styles.documentCategory, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                            {doc.category === 'receipt' && t('doc_category_receipt')}
                            {doc.category === 'contract' && t('doc_category_contract')}
                            {doc.category === 'invoice' && t('doc_category_invoice')}
                            {doc.category === 'certificate' && t('doc_category_certificate')}
                            {doc.category === 'other' && t('doc_category_other')}
                          </Text>
                          <Text style={[styles.documentType, { color: theme.colors.primary, fontFamily: theme.fonts.bodyFamily }] }>
                            {doc.fileType.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {doc.thumbnailUrl && (
                        <Image
                          source={{ uri: doc.thumbnailUrl }}
                          style={[styles.documentThumbnail, { backgroundColor: isDark ? '#0B1220' : '#e0e0e0' }]}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {selectedEntries.length === 0 && 
             selectedDocuments.length === 0 && (
              <Text style={[styles.noEntriesText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{t('calendar_empty')}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  monthNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  navButton: {
    padding: 8,
  },
  navButtonText: {
    fontSize: 32,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  monthYearText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  dayNamesRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  calendarScroll: {
    flex: 1,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  loadingBannerText: {
    fontSize: 13,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayText: {
    fontSize: 16,
    color: '#333',
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  otherMonthText: {
    color: '#999',
  },
  today: {
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
  },
  todayText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  selectedDay: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  indicatorsContainer: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    gap: 4,
  },
  entryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF6B6B',
  },
  documentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9CA3AF',
  },
  selectedDateSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedDateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  entryItem: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  entryItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  entryItemTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  entryItemPreview: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  entryItemTime: {
    fontSize: 12,
    color: '#999',
  },
  entryThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  noEntriesText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    marginTop: 4,
  },
  documentItem: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  documentItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  documentTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  documentItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  documentItemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  documentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentCategory: {
    fontSize: 13,
    color: '#6B7280',
  },
  documentType: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  documentThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
});
