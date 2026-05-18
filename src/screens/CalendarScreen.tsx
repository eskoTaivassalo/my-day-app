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
import { ensureVideoThumbnailCached, getEntriesFast, resolveEntryMediaUris } from '../services/diaryService';
import { getDocuments } from '../services/documentService';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  hasActivity: boolean;
  hasEntry: boolean;
  hasDocument: boolean;
}

const makeDateKey = (date: Date): string => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

export default function CalendarScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const locale = getLocaleFromLanguage(language);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedSelectedEntries, setResolvedSelectedEntries] = useState<DiaryEntry[]>([]);
  const [videoThumbnailMap, setVideoThumbnailMap] = useState<Record<string, string>>({});

  const loadRequestIdRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const lastFocusRefreshAtRef = useRef(0);
  const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    entries.forEach((entry) => {
      const key = makeDateKey(entry.date);
      const current = map.get(key);
      if (current) {
        current.push(entry);
      } else {
        map.set(key, [entry]);
      }
    });
    return map;
  }, [entries]);

  const documentsByDate = useMemo(() => {
    const map = new Map<string, Document[]>();
    documents.forEach((doc) => {
      const key = makeDateKey(doc.date);
      const current = map.get(key);
      if (current) {
        current.push(doc);
      } else {
        map.set(key, [doc]);
      }
    });
    return map;
  }, [documents]);

  const activityDates = useMemo(() => {
    const dateSet = new Set<string>();
    entriesByDate.forEach((_, key) => dateSet.add(key));
    documentsByDate.forEach((_, key) => dateSet.add(key));
    return dateSet;
  }, [entriesByDate, documentsByDate]);

  const loadEntries = useCallback(async (force = false) => {
    if (!user) return;

    const now = Date.now();
    if (!force && hasLoadedRef.current && now - lastFocusRefreshAtRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) {
      return;
    }
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;
    lastFocusRefreshAtRef.current = now;
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
        hasLoadedRef.current = true;
      }
    } catch {
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
      loadInFlightRef.current = false;
    }
  }, [user]);

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

  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const firstWeekdayMonFirst = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: CalendarDay[] = [];

    for (let i = firstWeekdayMonFirst; i > 0; i--) {
      const date = new Date(year, month, 1 - i);
      const dateKey = makeDateKey(date);
      days.push({
        date,
        isCurrentMonth: false,
        hasActivity: activityDates.has(dateKey),
        hasEntry: entriesByDate.has(dateKey),
        hasDocument: documentsByDate.has(dateKey),
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = makeDateKey(date);
      days.push({
        date,
        isCurrentMonth: true,
        hasActivity: activityDates.has(dateKey),
        hasEntry: entriesByDate.has(dateKey),
        hasDocument: documentsByDate.has(dateKey),
      });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      const dateKey = makeDateKey(date);
      days.push({
        date,
        isCurrentMonth: false,
        hasActivity: activityDates.has(dateKey),
        hasEntry: entriesByDate.has(dateKey),
        hasDocument: documentsByDate.has(dateKey),
      });
    }

    setCalendarDays(days);
  }, [currentDate, activityDates, entriesByDate, documentsByDate]);

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
    if (!selectedDate) return [];
    return entriesByDate.get(makeDateKey(selectedDate)) || [];
  }, [selectedDate, entriesByDate]);

  const selectedDocuments = useMemo(() => {
    if (!selectedDate) return [];
    return documentsByDate.get(makeDateKey(selectedDate)) || [];
  }, [selectedDate, documentsByDate]);

  useEffect(() => {
    let isMounted = true;

    const resolveSelectedEntryMedia = async () => {
      if (selectedEntries.length === 0) {
        setResolvedSelectedEntries([]);
        return;
      }

      // Show list immediately, then hydrate media urls in background.
      setResolvedSelectedEntries(selectedEntries);
      const results = await Promise.allSettled(
        selectedEntries.map((entry) => resolveEntryMediaUris(entry))
      );

      if (!isMounted) {
        return;
      }

      const resolved = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        return selectedEntries[index];
      });

      setResolvedSelectedEntries(resolved);
    };

    void resolveSelectedEntryMedia();

    return () => {
      isMounted = false;
    };
  }, [selectedEntries]);

  useEffect(() => {
    const entriesWithMissingThumbs = resolvedSelectedEntries.filter((entry) => {
      const firstVideo = entry.videos?.[0];
      if (!firstVideo) {
        return false;
      }
      const storedThumbnail = entry.videoThumbnails?.[firstVideo];
      if (storedThumbnail) {
        return false;
      }
      return !videoThumbnailMap[entry.id];
    });

    if (entriesWithMissingThumbs.length === 0) {
      return;
    }

    let cancelled = false;

    const resolveThumbs = async () => {
      const results = await Promise.allSettled(
        entriesWithMissingThumbs.map(async (entry) => {
          const firstVideo = entry.videos?.[0];
          if (!firstVideo) return null;
          const thumbnailUri = await ensureVideoThumbnailCached(firstVideo);
          if (!thumbnailUri) return null;
          return { entryId: entry.id, thumbnailUri };
        })
      );

      if (cancelled) {
        return;
      }

      setVideoThumbnailMap((prev) => {
        let changed = false;
        const next = { ...prev };

        results.forEach((result) => {
          if (result.status !== 'fulfilled' || !result.value) {
            return;
          }

          const { entryId, thumbnailUri } = result.value;
          if (!thumbnailUri || next[entryId] === thumbnailUri) {
            return;
          }

          next[entryId] = thumbnailUri;
          changed = true;
        });

        return changed ? next : prev;
      });
    };

    void resolveThumbs();

    return () => {
      cancelled = true;
    };
  }, [resolvedSelectedEntries, videoThumbnailMap]);

  const entriesToShow = useMemo(() => {
    if (resolvedSelectedEntries.length > 0) {
      return resolvedSelectedEntries;
    }
    return selectedEntries;
  }, [resolvedSelectedEntries, selectedEntries]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleEntryPress = (entry: DiaryEntry) => {
    navigation.navigate('EntryDetail', {
      entry: {
        ...entry,
        date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
        createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
        updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
      },
    });
  };

  const handleDocumentPress = (document: Document) => {
    navigation.navigate('DocumentDetail', {
      document: {
        ...document,
        date: document.date.toISOString(),
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      },
    });
  };

  const renderDay = (day: CalendarDay, index: number) => {
    const isSelected = selectedDate ? isSameDay(day.date, selectedDate) : false;
    const isToday = isSameDay(day.date, new Date());

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.dayCell,
          !day.isCurrentMonth && styles.otherMonthDay,
          isSelected && [styles.selectedDay, { backgroundColor: theme.colors.primary }],
          isToday && !isSelected && [styles.today, { borderColor: theme.colors.primary }],
        ]}
        onPress={() => setSelectedDate(day.date)}
      >
        <Text
          style={[
            styles.dayText,
            { color: theme.colors.text },
            !day.isCurrentMonth && [styles.otherMonthText, { color: theme.colors.textSecondary }],
            isSelected && styles.selectedDayText,
          ]}
        >
          {day.date.getDate()}
        </Text>
        {(day.hasEntry || day.hasDocument) && (
          <View style={styles.dayIndicators}>
            {day.hasEntry && (
              <View style={[styles.activityDot, { backgroundColor: isSelected ? '#FFFFFF' : theme.colors.accent }]} />
            )}
            {day.hasDocument && (
              <View style={[styles.documentDot, { backgroundColor: isSelected ? '#E5E7EB' : '#9CA3AF' }]} />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEntryMiniCard = (entry: DiaryEntry) => {
    const firstVideo = entry.videos?.[0];
    const storedVideoThumb = firstVideo ? entry.videoThumbnails?.[firstVideo] : undefined;
    const generatedVideoThumb = videoThumbnailMap[entry.id];
    const imagePreview = entry.images?.[0];
    const previewUri = imagePreview || storedVideoThumb || generatedVideoThumb;
    const isVideoPreview = !imagePreview && Boolean(firstVideo);

    return (
      <TouchableOpacity
        key={entry.id}
        style={[styles.entryMiniCard, { backgroundColor: theme.colors.white, borderColor: theme.colors.border }]}
        activeOpacity={0.8}
        onPress={() => handleEntryPress(entry)}
      >
        <View style={styles.entryMiniTextWrap}>
          <Text style={[styles.entryMiniTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={1}>
            {entry.title}
          </Text>
          <Text style={[styles.entryMiniContent, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={2}>
            {entry.content}
          </Text>
          <View style={styles.entryMiniMetaRow}>
            <Text style={[styles.entryMiniTime, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
              {new Date(entry.date).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {entry.images.length > 0 && (
              <Text style={[styles.entryMiniCount, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>📷 {entry.images.length}</Text>
            )}
            {entry.videos && entry.videos.length > 0 && (
              <Text style={[styles.entryMiniCount, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>🎥 {entry.videos.length}</Text>
            )}
          </View>
        </View>

        <View style={[styles.entryMiniPreviewWrap, { backgroundColor: theme.colors.backgroundLight }]}> 
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.entryMiniPreview} resizeMode="cover" />
          ) : (
            <Text style={styles.entryMiniPlaceholderIcon}>{isVideoPreview ? '🎥' : '📝'}</Text>
          )}
          {isVideoPreview && (
            <View style={[styles.videoBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}> 
              <Text style={styles.videoBadgeText}>VIDEO</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <View style={[styles.header, { backgroundColor: theme.colors.white, borderBottomColor: theme.colors.border }]}> 
        <Text style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.headingFamily }]}>{t('calendar_header')}</Text>
      </View>

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

      <View style={[styles.dayNamesRow, { backgroundColor: theme.colors.white }]}> 
        {dayNames.map((name, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={[styles.dayNameText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>{name}</Text>
          </View>
        ))}
      </View>

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

        {selectedDate && (
          <View style={[styles.selectedDateSection, { backgroundColor: theme.colors.white, borderColor: theme.colors.border }]}> 
            <Text style={[styles.selectedDateTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}> 
              {selectedDate.toLocaleDateString(locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>

            {entriesToShow.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('calendar_entries')}</Text>
                {entriesToShow.map((entry) => renderEntryMiniCard(entry))}
              </View>
            )}

            {selectedDocuments.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]}>{t('calendar_documents')}</Text>
                {selectedDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[styles.simpleItem, { borderColor: theme.colors.border }]}
                    onPress={() => handleDocumentPress(doc)}
                  >
                    <Text style={[styles.simpleItemTitle, { color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }]} numberOfLines={1}>
                      {doc.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {entriesToShow.length === 0 && selectedDocuments.length === 0 && (
              <Text style={[styles.noEntriesText, { color: theme.colors.textSecondary, fontFamily: theme.fonts.bodyFamily }]}>
                {t('calendar_empty')}
              </Text>
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
  },
  header: {
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  monthNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 30,
  },
  monthYearText: {
    fontSize: 20,
    fontWeight: '600',
  },
  dayNamesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  loadingBannerText: {
    fontSize: 13,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 2,
  },
  dayText: {
    fontSize: 16,
  },
  otherMonthDay: {
    opacity: 0.35,
  },
  otherMonthText: {
    opacity: 0.8,
  },
  selectedDay: {
    borderRadius: 12,
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '700',
  },
  today: {
    borderWidth: 1,
  },
  dayIndicators: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  documentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  selectedDateSection: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedDateTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'capitalize',
  },
  sectionBlock: {
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  simpleItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  simpleItemTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  entryMiniCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  entryMiniTextWrap: {
    flex: 1,
  },
  entryMiniTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  entryMiniContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  entryMiniMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  entryMiniTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  entryMiniCount: {
    fontSize: 12,
  },
  entryMiniPreviewWrap: {
    width: 86,
    height: 86,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  entryMiniPreview: {
    width: '100%',
    height: '100%',
  },
  entryMiniPlaceholderIcon: {
    fontSize: 24,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  noEntriesText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
