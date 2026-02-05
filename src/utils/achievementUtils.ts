import { DiaryEntry } from '../types/DiaryEntry';

export interface Achievement {
  id: number;
  name: string;
  icon: string;
  requirement: number;
  type: 'streak' | 'entries' | 'images' | 'words' | 'multiDay' | 'shared' | 'location' | 'earlyBird' | 'nightOwl' | 'weekend' | 'photoCollection';
  description: string;
}

export interface Stats {
  totalEntries: number;
  totalImages: number;
  longestStreak: number;
  currentStreak: number;
  firstEntryDate: Date | null;
  totalWords: number;
  multiDayCount: number;
  sharedCount: number;
  entriesWithLocation: number;
  earlyBirdCount: number;
  nightOwlCount: number;
  weekendCount: number;
  maxImagesInEntry: number;
}

export const achievements: Achievement[] = [
  // Streak saavutukset
  { id: 1, name: 'Ensimmäinen askel', icon: '🎖️', requirement: 1, type: 'streak', description: 'Kirjoita ensimmäinen merkintäsi' },
  { id: 2, name: 'Sitoutunut', icon: '🔥', requirement: 3, type: 'streak', description: '3 päivän putki' },
  { id: 3, name: 'Viikon voittaja', icon: '⭐', requirement: 7, type: 'streak', description: '7 päivän putki' },
  { id: 4, name: 'Kuukauden mestari', icon: '🏆', requirement: 30, type: 'streak', description: '30 päivän putki' },
  { id: 5, name: 'Vuoden sankari', icon: '👑', requirement: 365, type: 'streak', description: '365 päivän putki' },
  
  // Merkintämäärä
  { id: 6, name: 'Aloittelija', icon: '📝', requirement: 5, type: 'entries', description: '5 merkintää' },
  { id: 7, name: 'Kirjoittaja', icon: '✍️', requirement: 10, type: 'entries', description: '10 merkintää' },
  { id: 8, name: 'Aktiivinen', icon: '💪', requirement: 25, type: 'entries', description: '25 merkintää' },
  { id: 9, name: 'Tarinankertoija', icon: '📖', requirement: 50, type: 'entries', description: '50 merkintää' },
  { id: 10, name: 'Muistelija', icon: '📚', requirement: 100, type: 'entries', description: '100 merkintää' },
  { id: 11, name: 'Päiväkirjamestari', icon: '🎯', requirement: 250, type: 'entries', description: '250 merkintää' },
  
  // Kuvat
  { id: 12, name: 'Ensimmäinen kuva', icon: '📸', requirement: 1, type: 'images', description: 'Lisää ensimmäinen kuvasi' },
  { id: 13, name: 'Kuvagalleria', icon: '🖼️', requirement: 10, type: 'images', description: '10 kuvaa' },
  { id: 14, name: 'Valokuvaaja', icon: '📷', requirement: 50, type: 'images', description: '50 kuvaa' },
  { id: 15, name: 'Kuva-arkisto', icon: '🎨', requirement: 100, type: 'images', description: '100 kuvaa' },
  
  // Sanat
  { id: 16, name: 'Puhelias', icon: '💬', requirement: 20, type: 'words', description: 'Kirjoita 20+ sanaa yhteen merkintään' },
  { id: 17, name: 'Kertoja', icon: '📜', requirement: 50, type: 'words', description: 'Kirjoita 50+ sanaa yhteen merkintään' },
  { id: 18, name: 'Esseen kirjoittaja', icon: '📄', requirement: 100, type: 'words', description: 'Kirjoita 100+ sanaa yhteen merkintään' },
  
  // Useampi merkintä päivässä
  { id: 19, name: 'Tuottelias päivä', icon: '⚡', requirement: 2, type: 'multiDay', description: '2 merkintää samana päivänä' },
  { id: 20, name: 'Supertuottaja', icon: '💥', requirement: 3, type: 'multiDay', description: '3 merkintää samana päivänä' },
  
  // Jakamiset
  { id: 21, name: 'Jakaja', icon: '🔗', requirement: 1, type: 'shared', description: 'Jaa ensimmäinen merkintäsi' },
  { id: 22, name: 'Sosiaalinen', icon: '🌟', requirement: 5, type: 'shared', description: 'Jaa 5 merkintää' },
  { id: 23, name: 'Jakomaestro', icon: '🎭', requirement: 10, type: 'shared', description: 'Jaa 10 merkintää' },
  
  // Sijainti
  { id: 24, name: 'Paikanmerkitsijä', icon: '📍', requirement: 1, type: 'location', description: 'Lisää sijainti merkintään' },
  { id: 25, name: 'Matkaaja', icon: '🗺️', requirement: 10, type: 'location', description: '10 merkintää sijainnilla' },
  { id: 26, name: 'Maailmanmatkaaja', icon: '🌍', requirement: 25, type: 'location', description: '25 merkintää sijainnilla' },
  
  // Aika
  { id: 27, name: 'Aamulintu', icon: '🌅', requirement: 1, type: 'earlyBird', description: 'Kirjoita ennen klo 8' },
  { id: 28, name: 'Yöpöllö', icon: '🦉', requirement: 1, type: 'nightOwl', description: 'Kirjoita klo 22 jälkeen' },
  { id: 29, name: 'Yösankari', icon: '🌙', requirement: 5, type: 'nightOwl', description: '5 merkintää klo 22 jälkeen' },
  
  // Viikonloppu
  { id: 30, name: 'Viikonloppukirjoittaja', icon: '🎉', requirement: 1, type: 'weekend', description: 'Kirjoita viikonloppuna' },
  { id: 31, name: 'Viikonloppuaktiivinen', icon: '🎊', requirement: 5, type: 'weekend', description: '5 viikonloppumerkintää' },
  
  // Kuvamäärä yhdessä merkinnässä
  { id: 32, name: 'Kuvakollektoori', icon: '🎞️', requirement: 5, type: 'photoCollection', description: '5 kuvaa yhdessä merkinnässä' },
  { id: 33, name: 'Kuvakokoelma', icon: '📚', requirement: 10, type: 'photoCollection', description: '10 kuvaa yhdessä merkinnässä' },
];

export const calculateStreaks = (entries: DiaryEntry[]): { current: number; longest: number } => {
  if (entries.length === 0) return { current: 0, longest: 0 };

  const sortedEntries = [...entries].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const latestEntry = new Date(sortedEntries[0].date);
  latestEntry.setHours(0, 0, 0, 0);
  const daysSinceLatest = Math.floor((today.getTime() - latestEntry.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceLatest <= 1) {
    currentStreak = 1;

    for (let i = 1; i < sortedEntries.length; i++) {
      const current = new Date(sortedEntries[i - 1].date);
      const previous = new Date(sortedEntries[i].date);
      current.setHours(0, 0, 0, 0);
      previous.setHours(0, 0, 0, 0);

      const diff = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  for (let i = 1; i < sortedEntries.length; i++) {
    const current = new Date(sortedEntries[i - 1].date);
    const previous = new Date(sortedEntries[i].date);
    current.setHours(0, 0, 0, 0);
    previous.setHours(0, 0, 0, 0);

    const diff = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 1) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  longestStreak = Math.max(longestStreak, currentStreak, 1);

  return { current: currentStreak, longest: longestStreak };
};

export const calculateStats = (entries: DiaryEntry[]): Stats => {
  const totalImages = entries.reduce((sum, entry) => sum + (entry.images?.length || 0), 0);
  const firstEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const { current, longest } = calculateStreaks(entries);

  // Laske sanat kaikista merkinnöistä
  const totalWords = entries.reduce((sum, entry) => {
    const words = entry.content.trim().split(/\s+/).filter(w => w.length > 0);
    return sum + words.length;
  }, 0);

  // Laske päivät joissa on useampi merkintä
  const entriesByDate: { [key: string]: number } = {};
  entries.forEach(entry => {
    const dateKey = new Date(entry.date).toISOString().split('T')[0];
    entriesByDate[dateKey] = (entriesByDate[dateKey] || 0) + 1;
  });
  const multiDayCount = Object.values(entriesByDate).filter(count => count > 1).length;

  // Laske jaetut merkinnät
  const sharedCount = entries.filter(entry => entry.shared === true).length;
  console.log('Calculating stats - Shared entries:', sharedCount, 'Total entries:', entries.length);

  // Laske merkinnät joissa on sijainti
  const entriesWithLocation = entries.filter(entry => entry.location).length;

  // Laske aamulinnut (ennen klo 8)
  const earlyBirdCount = entries.filter(entry => {
    const hour = new Date(entry.date).getHours();
    return hour < 8;
  }).length;

  // Laske yöpöllöt (klo 22 jälkeen)
  const nightOwlCount = entries.filter(entry => {
    const hour = new Date(entry.date).getHours();
    return hour >= 22;
  }).length;

  // Laske viikonloppumerkinnät
  const weekendCount = entries.filter(entry => {
    const day = new Date(entry.date).getDay();
    return day === 0 || day === 6; // 0 = sunnuntai, 6 = lauantai
  }).length;

  // Etsi eniten kuvia yhdessä merkinnässä
  const maxImagesInEntry = entries.reduce((max, entry) => {
    const imageCount = entry.images?.length || 0;
    return Math.max(max, imageCount);
  }, 0);

  return {
    totalEntries: entries.length,
    totalImages,
    longestStreak: longest,
    currentStreak: current,
    firstEntryDate: firstEntry ? new Date(firstEntry.date) : null,
    totalWords,
    multiDayCount,
    sharedCount,
    entriesWithLocation,
    earlyBirdCount,
    nightOwlCount,
    weekendCount,
    maxImagesInEntry,
  };
};

export const getUnlockedAchievements = (stats: Stats): Achievement[] => {
  return achievements.filter((achievement) => {
    switch (achievement.type) {
      case 'streak':
        return stats.longestStreak >= achievement.requirement;
      case 'entries':
        return stats.totalEntries >= achievement.requirement;
      case 'images':
        return stats.totalImages >= achievement.requirement;
      case 'words':
        // Tarkistetaan onko yksikään merkintä jossa on tarpeeksi sanoja
        return stats.totalWords >= achievement.requirement;
      case 'multiDay':
        return stats.multiDayCount >= achievement.requirement;
      case 'shared':
        return stats.sharedCount >= achievement.requirement;
      case 'location':
        return stats.entriesWithLocation >= achievement.requirement;
      case 'earlyBird':
        return stats.earlyBirdCount >= achievement.requirement;
      case 'nightOwl':
        return stats.nightOwlCount >= achievement.requirement;
      case 'weekend':
        return stats.weekendCount >= achievement.requirement;
      case 'photoCollection':
        return stats.maxImagesInEntry >= achievement.requirement;
      default:
        return false;
    }
  });
};

export const getNextAchievement = (stats: Stats): Achievement | null => {
  const locked = achievements
    .filter((achievement) => {
      switch (achievement.type) {
        case 'streak':
          return stats.longestStreak < achievement.requirement;
        case 'entries':
          return stats.totalEntries < achievement.requirement;
        case 'images':
          return stats.totalImages < achievement.requirement;
        case 'words':
          return stats.totalWords < achievement.requirement;
        case 'multiDay':
          return stats.multiDayCount < achievement.requirement;
        case 'shared':
          return stats.sharedCount < achievement.requirement;
        case 'location':
          return stats.entriesWithLocation < achievement.requirement;
        case 'earlyBird':
          return stats.earlyBirdCount < achievement.requirement;
        case 'nightOwl':
          return stats.nightOwlCount < achievement.requirement;
        case 'weekend':
          return stats.weekendCount < achievement.requirement;
        case 'photoCollection':
          return stats.maxImagesInEntry < achievement.requirement;
        default:
          return true;
      }
    })
    .sort((a, b) => a.requirement - b.requirement);

  return locked[0] || null;
};

export const checkNewAchievements = (oldStats: Stats, newStats: Stats): Achievement[] => {
  const oldUnlocked = getUnlockedAchievements(oldStats);
  const newUnlocked = getUnlockedAchievements(newStats);

  const newAchievements = newUnlocked.filter(
    (achievement) => !oldUnlocked.find((old) => old.id === achievement.id)
  );

  return newAchievements;
};

export const getProgressToNext = (stats: Stats): { progress: number; current: number; target: number } => {
  const next = getNextAchievement(stats);
  if (!next) return { progress: 100, current: 0, target: 0 };

  let current = 0;
  switch (next.type) {
    case 'streak':
      current = stats.currentStreak;
      break;
    case 'entries':
      current = stats.totalEntries;
      break;
    case 'images':
      current = stats.totalImages;
      break;
    case 'words':
      current = stats.totalWords;
      break;
    case 'multiDay':
      current = stats.multiDayCount;
      break;
    case 'shared':
      current = stats.sharedCount;
      break;
    case 'location':
      current = stats.entriesWithLocation;
      break;
    case 'earlyBird':
      current = stats.earlyBirdCount;
      break;
    case 'nightOwl':
      current = stats.nightOwlCount;
      break;
    case 'weekend':
      current = stats.weekendCount;
      break;
    case 'photoCollection':
      current = stats.maxImagesInEntry;
      break;
  }

  const progress = Math.min((current / next.requirement) * 100, 100);
  return { progress, current, target: next.requirement };
};
