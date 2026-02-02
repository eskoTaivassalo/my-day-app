import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
} from 'react-native';
import { DiaryEntry } from '../types/DiaryEntry';
import { Document } from '../types/Document';
import { useAuth } from '../contexts/AuthContext';
import { getEntries } from '../services/diaryService';
import { getDocuments } from '../services/documentService';

const { width } = Dimensions.get('window');
const CALENDAR_WIDTH = width - 32;
const DAY_WIDTH = CALENDAR_WIDTH / 7;

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  hasEntry: boolean;
  hasDocument: boolean;
  entries: DiaryEntry[];
  documents: Document[];
}

export default function CalendarScreen({ navigation }: any) {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadEntries();
    }
  }, [user]);

  useEffect(() => {
    generateCalendar();
  }, [currentDate, entries, documents]);

  const loadEntries = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const [fetchedEntries, fetchedDocuments] = await Promise.all([
        getEntries(user.uid),
        getDocuments(user.uid),
      ]);
      setEntries(fetchedEntries);
      setDocuments(fetchedDocuments);
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setLoading(false);
    }
  };

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
        entries: getEntriesForDate(date),
        documents: getDocumentsForDate(date),
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
        entries: getEntriesForDate(date),
        documents: getDocumentsForDate(date),
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
        entries: getEntriesForDate(date),
        documents: getDocumentsForDate(date),
      });
    }

    setCalendarDays(days);
  };

  const hasEntryOnDate = (date: Date): boolean => {
    return entries.some((entry) => isSameDay(new Date(entry.date), date));
  };

  const getEntriesForDate = (date: Date): DiaryEntry[] => {
    return entries.filter((entry) => isSameDay(new Date(entry.date), date));
  };

  const hasDocumentOnDate = (date: Date): boolean => {
    return documents.some((doc) => isSameDay(new Date(doc.date), date));
  };

  const getDocumentsForDate = (date: Date): Document[] => {
    return documents.filter((doc) => isSameDay(new Date(doc.date), date));
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
    navigation.navigate('EntryDetail', { entry });
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

  const monthNames = [
    'Tammikuu',
    'Helmikuu',
    'Maaliskuu',
    'Huhtikuu',
    'Toukokuu',
    'Kesäkuu',
    'Heinäkuu',
    'Elokuu',
    'Syyskuu',
    'Lokakuu',
    'Marraskuu',
    'Joulukuu',
  ];

  const dayNames = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

  const renderDay = (day: CalendarDay, index: number) => {
    const isSelected = selectedDate && isSameDay(day.date, selectedDate);
    const today = isToday(day.date);

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.dayCell,
          !day.isCurrentMonth && styles.otherMonthDay,
          isSelected && styles.selectedDay,
          today && styles.today,
        ]}
        onPress={() => handleDayPress(day)}
      >
        <Text
          style={[
            styles.dayText,
            !day.isCurrentMonth && styles.otherMonthText,
            isSelected && styles.selectedDayText,
            today && styles.todayText,
          ]}
        >
          {day.date.getDate()}
        </Text>
        <View style={styles.indicatorsContainer}>
          {day.hasEntry && (
            <View style={styles.entryDot} />
          )}
          {day.hasDocument && (
            <View style={styles.documentDot} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kalenteri</Text>
      </View>

      {/* Month Navigator */}
      <View style={styles.monthNavigator}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.monthYearText}>
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </Text>

        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day Names */}
      <View style={styles.dayNamesRow}>
        {dayNames.map((name, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={styles.dayNameText}>{name}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <ScrollView style={styles.calendarScroll}>
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, index) => renderDay(day, index))}
        </View>

        {/* Selected Date Entries */}
        {selectedDate && (
          <View style={styles.selectedDateSection}>
            <Text style={styles.selectedDateTitle}>
              {selectedDate.toLocaleDateString('fi-FI', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>

            {getEntriesForDate(selectedDate).length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>Päiväkirjamerkinnät</Text>
                {getEntriesForDate(selectedDate).map((entry) => (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.entryItem}
                    onPress={() => handleEntryPress(entry)}
                  >
                    <View style={styles.entryItemContent}>
                      <View style={styles.entryTextContainer}>
                        <Text style={styles.entryItemTitle}>{entry.title}</Text>
                        <Text style={styles.entryItemPreview} numberOfLines={2}>
                          {entry.content}
                        </Text>
                        <Text style={styles.entryItemTime}>
                          {new Date(entry.date).toLocaleTimeString('fi-FI', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      {entry.images && entry.images.length > 0 && (
                        <Image
                          source={{ uri: entry.images[0] }}
                          style={styles.entryThumbnail}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {getDocumentsForDate(selectedDate).length > 0 ? (
              <View style={{ marginTop: getEntriesForDate(selectedDate).length > 0 ? 16 : 0 }}>
                <Text style={styles.sectionTitle}>Dokumentit</Text>
                {getDocumentsForDate(selectedDate).map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.documentItem}
                    onPress={() => handleDocumentPress(doc)}
                  >
                    <View style={styles.documentItemContent}>
                      <View style={styles.documentTextContainer}>
                        <Text style={styles.documentItemTitle}>{doc.title}</Text>
                        {doc.description && (
                          <Text style={styles.documentItemDescription} numberOfLines={2}>
                            {doc.description}
                          </Text>
                        )}
                        <View style={styles.documentMeta}>
                          <Text style={styles.documentCategory}>
                            {doc.category === 'receipt' && '🧾 Kuitti'}
                            {doc.category === 'contract' && '📄 Sopimus'}
                            {doc.category === 'invoice' && '💰 Lasku'}
                            {doc.category === 'certificate' && '🏆 Todistus'}
                            {doc.category === 'other' && '📎 Muu'}
                          </Text>
                          <Text style={styles.documentType}>
                            {doc.fileType.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {doc.thumbnailUrl && (
                        <Image
                          source={{ uri: doc.thumbnailUrl }}
                          style={styles.documentThumbnail}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {getEntriesForDate(selectedDate).length === 0 && 
             getDocumentsForDate(selectedDate).length === 0 && (
              <Text style={styles.noEntriesText}>Ei merkintöjä tai dokumentteja tältä päivältä</Text>
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
    width: DAY_WIDTH,
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
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  dayCell: {
    width: DAY_WIDTH,
    height: DAY_WIDTH,
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
