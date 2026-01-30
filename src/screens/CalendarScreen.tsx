import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { DiaryEntry } from '../types/DiaryEntry';

const { width } = Dimensions.get('window');
const CALENDAR_WIDTH = width - 32;
const DAY_WIDTH = CALENDAR_WIDTH / 7;

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  hasEntry: boolean;
  entries: DiaryEntry[];
}

export default function CalendarScreen({ navigation }: any) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    generateCalendar();
  }, [currentDate, entries]);

  const loadEntries = async () => {
    // TODO: Fetch from Firebase Firestore
    // For now, using mock data
    const mockEntries: DiaryEntry[] = [
      {
        id: '1',
        date: new Date(),
        title: 'Tänään',
        content: 'Päivän muistiinpanot',
        images: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    setEntries(mockEntries);
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
        entries: getEntriesForDate(date),
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
        hasEntry: hasEntryOnDate(date),
        entries: getEntriesForDate(date),
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
        entries: getEntriesForDate(date),
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
    if (day.hasEntry && day.entries.length > 0) {
      // TODO: Navigate to entry detail or show entries list
      console.log('Entries for', day.date, day.entries);
    }
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
        {day.hasEntry && (
          <View style={styles.entryDot}>
            <View style={styles.dot} />
          </View>
        )}
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
              getEntriesForDate(selectedDate).map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.entryItem}
                  onPress={() => {
                    // TODO: Navigate to entry detail
                  }}
                >
                  <Text style={styles.entryItemTitle}>{entry.title}</Text>
                  <Text style={styles.entryItemContent} numberOfLines={2}>
                    {entry.content}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noEntriesText}>Ei merkintöjä tältä päivältä</Text>
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
  entryDot: {
    position: 'absolute',
    bottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF6B6B',
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
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 8,
  },
  entryItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  entryItemContent: {
    fontSize: 14,
    color: '#666',
  },
  noEntriesText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
});
