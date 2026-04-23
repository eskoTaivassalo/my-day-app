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

export type AchievementLocale = 'fi' | 'en' | 'sv';

export const achievements: Achievement[] = [
  // Streak saavutukset
  { id: 1, name: 'Ensimmäinen askel', icon: '🎖️', requirement: 1, type: 'streak', description: 'Kirjoita ensimmäinen merkintäsi' },
  { id: 34, name: 'Kahden päivän putki', icon: '🔥', requirement: 2, type: 'streak', description: '2 päivän putki' },
  { id: 2, name: 'Sitoutunut', icon: '🔥', requirement: 3, type: 'streak', description: '3 päivän putki' },
  { id: 35, name: 'Pikkuputki', icon: '🔥', requirement: 4, type: 'streak', description: '4 päivän putki' },
  { id: 36, name: 'Viiden päivän putki', icon: '🔥', requirement: 5, type: 'streak', description: '5 päivän putki' },
  { id: 37, name: 'Kuuden päivän putki', icon: '🔥', requirement: 6, type: 'streak', description: '6 päivän putki' },
  { id: 3, name: 'Viikon voittaja', icon: '⭐', requirement: 7, type: 'streak', description: '7 päivän putki' },
  { id: 38, name: 'Kympin putki', icon: '⭐', requirement: 10, type: 'streak', description: '10 päivän putki' },
  { id: 39, name: 'Kahden viikon putki', icon: '⭐', requirement: 14, type: 'streak', description: '14 päivän putki' },
  { id: 40, name: 'Kolmen viikon putki', icon: '⭐', requirement: 21, type: 'streak', description: '21 päivän putki' },
  { id: 41, name: 'Neljä viikkoa', icon: '🏅', requirement: 28, type: 'streak', description: '28 päivän putki' },
  { id: 4, name: 'Kuukauden mestari', icon: '🏆', requirement: 30, type: 'streak', description: '30 päivän putki' },
  { id: 42, name: 'Kahden kuukauden putki', icon: '🏆', requirement: 60, type: 'streak', description: '60 päivän putki' },
  { id: 43, name: 'Kolmen kuukauden putki', icon: '🏆', requirement: 90, type: 'streak', description: '90 päivän putki' },
  { id: 44, name: 'Puolen vuoden putki', icon: '🏆', requirement: 180, type: 'streak', description: '180 päivän putki' },
  { id: 5, name: 'Vuoden sankari', icon: '👑', requirement: 365, type: 'streak', description: '365 päivän putki' },
  
  // Merkintämäärä
  { id: 45, name: 'Ensimerkintä', icon: '📝', requirement: 1, type: 'entries', description: '1 merkintä' },
  { id: 46, name: 'Kaksikko', icon: '📝', requirement: 2, type: 'entries', description: '2 merkintää' },
  { id: 47, name: 'Kolmikko', icon: '📝', requirement: 3, type: 'entries', description: '3 merkintää' },
  { id: 6, name: 'Aloittelija', icon: '📝', requirement: 5, type: 'entries', description: '5 merkintää' },
  { id: 48, name: 'Viikon kirjoittaja', icon: '✍️', requirement: 7, type: 'entries', description: '7 merkintää' },
  { id: 7, name: 'Kirjoittaja', icon: '✍️', requirement: 10, type: 'entries', description: '10 merkintää' },
  { id: 49, name: 'Pieni putki', icon: '✍️', requirement: 15, type: 'entries', description: '15 merkintää' },
  { id: 50, name: 'Kaksikymppinen', icon: '✍️', requirement: 20, type: 'entries', description: '20 merkintää' },
  { id: 8, name: 'Aktiivinen', icon: '💪', requirement: 25, type: 'entries', description: '25 merkintää' },
  { id: 51, name: 'Kuukauden alku', icon: '💪', requirement: 30, type: 'entries', description: '30 merkintää' },
  { id: 52, name: 'Nelikymppinen', icon: '💪', requirement: 40, type: 'entries', description: '40 merkintää' },
  { id: 9, name: 'Tarinankertoija', icon: '📖', requirement: 50, type: 'entries', description: '50 merkintää' },
  { id: 53, name: 'Kuusikymppinen', icon: '📖', requirement: 60, type: 'entries', description: '60 merkintää' },
  { id: 54, name: 'Seitsemänkymmentäviisi', icon: '📖', requirement: 75, type: 'entries', description: '75 merkintää' },
  { id: 10, name: 'Muistelija', icon: '📚', requirement: 100, type: 'entries', description: '100 merkintää' },
  { id: 55, name: 'Sata viisikymmentä', icon: '📚', requirement: 150, type: 'entries', description: '150 merkintää' },
  { id: 56, name: 'Kaksisataa', icon: '🎯', requirement: 200, type: 'entries', description: '200 merkintää' },
  { id: 11, name: 'Päiväkirjamestari', icon: '🎯', requirement: 250, type: 'entries', description: '250 merkintää' },
  { id: 57, name: 'Kolmesataa', icon: '🎯', requirement: 300, type: 'entries', description: '300 merkintää' },
  { id: 58, name: 'Neljäsataa', icon: '🎯', requirement: 400, type: 'entries', description: '400 merkintää' },
  { id: 59, name: 'Viisisataa', icon: '🎯', requirement: 500, type: 'entries', description: '500 merkintää' },
  
  // Kuvat
  { id: 12, name: 'Ensimmäinen kuva', icon: '📸', requirement: 1, type: 'images', description: 'Lisää ensimmäinen kuvasi' },
  { id: 60, name: 'Toinen kuva', icon: '📸', requirement: 2, type: 'images', description: '2 kuvaa' },
  { id: 61, name: 'Kolme kuvaa', icon: '📸', requirement: 3, type: 'images', description: '3 kuvaa' },
  { id: 62, name: 'Pieni albumi', icon: '🖼️', requirement: 5, type: 'images', description: '5 kuvaa' },
  { id: 13, name: 'Kuvagalleria', icon: '🖼️', requirement: 10, type: 'images', description: '10 kuvaa' },
  { id: 63, name: 'Kuvakeräilijä', icon: '🖼️', requirement: 15, type: 'images', description: '15 kuvaa' },
  { id: 64, name: 'Kuvakansio', icon: '📷', requirement: 25, type: 'images', description: '25 kuvaa' },
  { id: 14, name: 'Valokuvaaja', icon: '📷', requirement: 50, type: 'images', description: '50 kuvaa' },
  { id: 65, name: 'Kuvamestari', icon: '📷', requirement: 75, type: 'images', description: '75 kuvaa' },
  { id: 15, name: 'Kuva-arkisto', icon: '🎨', requirement: 100, type: 'images', description: '100 kuvaa' },
  { id: 66, name: 'Kuvavuori', icon: '🎨', requirement: 150, type: 'images', description: '150 kuvaa' },
  { id: 67, name: 'Kuvakirjasto', icon: '🎨', requirement: 200, type: 'images', description: '200 kuvaa' },
  
  // Sanat
  { id: 16, name: 'Puhelias', icon: '💬', requirement: 20, type: 'words', description: '20 sanaa yhteensä' },
  { id: 17, name: 'Kertoja', icon: '📜', requirement: 50, type: 'words', description: '50 sanaa yhteensä' },
  { id: 18, name: 'Esseen kirjoittaja', icon: '📄', requirement: 100, type: 'words', description: '100 sanaa yhteensä' },
  { id: 68, name: 'Sanailija', icon: '📄', requirement: 200, type: 'words', description: '200 sanaa yhteensä' },
  { id: 69, name: 'Kynäniekka', icon: '📄', requirement: 300, type: 'words', description: '300 sanaa yhteensä' },
  { id: 70, name: 'Tarinoija', icon: '📄', requirement: 500, type: 'words', description: '500 sanaa yhteensä' },
  { id: 71, name: 'Novellisti', icon: '📄', requirement: 750, type: 'words', description: '750 sanaa yhteensä' },
  { id: 72, name: 'Tuhat sanaa', icon: '📄', requirement: 1000, type: 'words', description: '1000 sanaa yhteensä' },
  { id: 73, name: 'Sanaseppä', icon: '📄', requirement: 1500, type: 'words', description: '1500 sanaa yhteensä' },
  { id: 74, name: 'Kertomusvarasto', icon: '📄', requirement: 2000, type: 'words', description: '2000 sanaa yhteensä' },
  { id: 75, name: 'Tarina-arkisto', icon: '📄', requirement: 3000, type: 'words', description: '3000 sanaa yhteensä' },
  { id: 76, name: 'Sanamestari', icon: '📄', requirement: 5000, type: 'words', description: '5000 sanaa yhteensä' },
  { id: 77, name: 'Sanavuori', icon: '📄', requirement: 10000, type: 'words', description: '10000 sanaa yhteensä' },
  
  // Useampi merkintä päivässä
  { id: 19, name: 'Tuottelias päivä', icon: '⚡', requirement: 2, type: 'multiDay', description: '2 merkintää samana päivänä' },
  { id: 20, name: 'Supertuottaja', icon: '💥', requirement: 3, type: 'multiDay', description: '3 merkintää samana päivänä' },
  { id: 78, name: 'Neljä merkintää', icon: '💥', requirement: 4, type: 'multiDay', description: '4 merkintää samana päivänä' },
  { id: 79, name: 'Viisi merkintää', icon: '💥', requirement: 5, type: 'multiDay', description: '5 merkintää samana päivänä' },
  { id: 80, name: 'Seitsemän merkintää', icon: '💥', requirement: 7, type: 'multiDay', description: '7 merkintää samana päivänä' },
  { id: 81, name: 'Kymmenen merkintää', icon: '💥', requirement: 10, type: 'multiDay', description: '10 merkintää samana päivänä' },
  { id: 82, name: 'Viisitoista merkintää', icon: '💥', requirement: 15, type: 'multiDay', description: '15 merkintää samana päivänä' },
  
  // Jakamiset
  { id: 21, name: 'Jakaja', icon: '🔗', requirement: 1, type: 'shared', description: 'Jaa ensimmäinen merkintäsi' },
  { id: 83, name: 'Jakelija', icon: '🔗', requirement: 2, type: 'shared', description: 'Jaa 2 merkintää' },
  { id: 84, name: 'Kolme jakoa', icon: '🔗', requirement: 3, type: 'shared', description: 'Jaa 3 merkintää' },
  { id: 22, name: 'Sosiaalinen', icon: '🌟', requirement: 5, type: 'shared', description: 'Jaa 5 merkintää' },
  { id: 85, name: 'Linkittäjä', icon: '🌟', requirement: 7, type: 'shared', description: 'Jaa 7 merkintää' },
  { id: 23, name: 'Jakomaestro', icon: '🎭', requirement: 10, type: 'shared', description: 'Jaa 10 merkintää' },
  { id: 86, name: 'Jakotahti', icon: '🎭', requirement: 15, type: 'shared', description: 'Jaa 15 merkintää' },
  { id: 87, name: 'Jakamisen mestari', icon: '🎭', requirement: 25, type: 'shared', description: 'Jaa 25 merkintää' },
  { id: 88, name: 'Jakamisen legenda', icon: '🎭', requirement: 50, type: 'shared', description: 'Jaa 50 merkintää' },
  
  // Sijainti
  { id: 24, name: 'Paikanmerkitsijä', icon: '📍', requirement: 1, type: 'location', description: 'Lisää sijainti merkintään' },
  { id: 89, name: 'Sijainti x2', icon: '📍', requirement: 2, type: 'location', description: '2 merkintää sijainnilla' },
  { id: 90, name: 'Sijainti x3', icon: '📍', requirement: 3, type: 'location', description: '3 merkintää sijainnilla' },
  { id: 91, name: 'Reissumuistiot', icon: '🗺️', requirement: 5, type: 'location', description: '5 merkintää sijainnilla' },
  { id: 25, name: 'Matkaaja', icon: '🗺️', requirement: 10, type: 'location', description: '10 merkintää sijainnilla' },
  { id: 92, name: 'Reissaaja', icon: '🗺️', requirement: 15, type: 'location', description: '15 merkintää sijainnilla' },
  { id: 26, name: 'Maailmanmatkaaja', icon: '🌍', requirement: 25, type: 'location', description: '25 merkintää sijainnilla' },
  { id: 93, name: 'Maailmankiertäjä', icon: '🌍', requirement: 50, type: 'location', description: '50 merkintää sijainnilla' },
  
  // Aika
  { id: 27, name: 'Aamulintu', icon: '🌅', requirement: 1, type: 'earlyBird', description: 'Kirjoita ennen klo 8' },
  { id: 94, name: 'Aamukirjoittaja', icon: '🌅', requirement: 3, type: 'earlyBird', description: '3 merkintää ennen klo 8' },
  { id: 95, name: 'Varhainen', icon: '🌅', requirement: 5, type: 'earlyBird', description: '5 merkintää ennen klo 8' },
  { id: 96, name: 'Aamurutiini', icon: '🌅', requirement: 10, type: 'earlyBird', description: '10 merkintää ennen klo 8' },
  { id: 97, name: 'Aamumestari', icon: '🌅', requirement: 20, type: 'earlyBird', description: '20 merkintää ennen klo 8' },
  { id: 28, name: 'Yöpöllö', icon: '🦉', requirement: 1, type: 'nightOwl', description: 'Kirjoita klo 22 jälkeen' },
  { id: 98, name: 'Iltakirjoittaja', icon: '🦉', requirement: 3, type: 'nightOwl', description: '3 merkintää klo 22 jälkeen' },
  { id: 29, name: 'Yösankari', icon: '🌙', requirement: 5, type: 'nightOwl', description: '5 merkintää klo 22 jälkeen' },
  { id: 99, name: 'Yöluova', icon: '🌙', requirement: 10, type: 'nightOwl', description: '10 merkintää klo 22 jälkeen' },
  { id: 100, name: 'Yömestari', icon: '🌙', requirement: 20, type: 'nightOwl', description: '20 merkintää klo 22 jälkeen' },
  
  // Viikonloppu
  { id: 30, name: 'Viikonloppukirjoittaja', icon: '🎉', requirement: 1, type: 'weekend', description: 'Kirjoita viikonloppuna' },
  { id: 101, name: 'Viikonloppu x2', icon: '🎉', requirement: 2, type: 'weekend', description: '2 viikonloppumerkintää' },
  { id: 102, name: 'Viikonloppu x3', icon: '🎉', requirement: 3, type: 'weekend', description: '3 viikonloppumerkintää' },
  { id: 31, name: 'Viikonloppuaktiivinen', icon: '🎊', requirement: 5, type: 'weekend', description: '5 viikonloppumerkintää' },
  { id: 103, name: 'Viikonloppukonkari', icon: '🎊', requirement: 10, type: 'weekend', description: '10 viikonloppumerkintää' },
  { id: 104, name: 'Viikonloppumestari', icon: '🎊', requirement: 20, type: 'weekend', description: '20 viikonloppumerkintää' },
  
  // Kuvamäärä yhdessä merkinnässä
  { id: 105, name: 'Kolme kuvaa', icon: '🎞️', requirement: 3, type: 'photoCollection', description: '3 kuvaa yhdessä merkinnässä' },
  { id: 32, name: 'Kuvakollektoori', icon: '🎞️', requirement: 5, type: 'photoCollection', description: '5 kuvaa yhdessä merkinnässä' },
  { id: 106, name: 'Seitsemän kuvaa', icon: '🎞️', requirement: 7, type: 'photoCollection', description: '7 kuvaa yhdessä merkinnässä' },
  { id: 33, name: 'Kuvakokoelma', icon: '📚', requirement: 10, type: 'photoCollection', description: '10 kuvaa yhdessä merkinnässä' },
  { id: 107, name: 'Kaksitoista kuvaa', icon: '📚', requirement: 12, type: 'photoCollection', description: '12 kuvaa yhdessä merkinnässä' },
  { id: 108, name: 'Viisitoista kuvaa', icon: '📚', requirement: 15, type: 'photoCollection', description: '15 kuvaa yhdessä merkinnässä' },
];

const pluralize = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

const getEnAchievementName = (achievement: Achievement): string => {
  const n = achievement.requirement;
  switch (achievement.type) {
    case 'streak':
      return n === 1 ? 'First Step' : `${n}-Day Streak`;
    case 'entries':
      return `${n} ${pluralize(n, 'Entry', 'Entries')}`;
    case 'images':
      return `${n} ${pluralize(n, 'Photo', 'Photos')}`;
    case 'words':
      return `${n} ${pluralize(n, 'Word', 'Words')}`;
    case 'multiDay':
      return `${n} in One Day`;
    case 'shared':
      return `Share ${n}`;
    case 'location':
      return `Location ${n}`;
    case 'earlyBird':
      return n === 1 ? 'Early Bird' : `Morning ${n}`;
    case 'nightOwl':
      return n === 1 ? 'Night Owl' : `Night ${n}`;
    case 'weekend':
      return `Weekend ${n}`;
    case 'photoCollection':
      return `${n} in One Entry`;
    default:
      return achievement.name;
  }
};

const getSvAchievementName = (achievement: Achievement): string => {
  const n = achievement.requirement;
  switch (achievement.type) {
    case 'streak':
      return n === 1 ? 'Forsta steget' : `${n} dagars svit`;
    case 'entries':
      return `${n} anteckningar`;
    case 'images':
      return `${n} bilder`;
    case 'words':
      return `${n} ord`;
    case 'multiDay':
      return `${n} pa en dag`;
    case 'shared':
      return `Dela ${n}`;
    case 'location':
      return `Plats ${n}`;
    case 'earlyBird':
      return n === 1 ? 'Morgonfagel' : `Morgon ${n}`;
    case 'nightOwl':
      return n === 1 ? 'Nattuggla' : `Natt ${n}`;
    case 'weekend':
      return `Helg ${n}`;
    case 'photoCollection':
      return `${n} i en anteckning`;
    default:
      return achievement.name;
  }
};

const getEnAchievementDescription = (achievement: Achievement): string => {
  const n = achievement.requirement;
  switch (achievement.type) {
    case 'streak':
      return n === 1 ? 'Write your first entry' : `${n}-day streak`;
    case 'entries':
      return `${n} ${pluralize(n, 'entry', 'entries')}`;
    case 'images':
      return n === 1 ? 'Add your first photo' : `${n} photos`;
    case 'words':
      return `${n} words total`;
    case 'multiDay':
      return `${n} entries in one day`;
    case 'shared':
      return n === 1 ? 'Share your first entry' : `Share ${n} entries`;
    case 'location':
      return n === 1 ? 'Add location to an entry' : `${n} entries with location`;
    case 'earlyBird':
      return n === 1 ? 'Write before 8 AM' : `${n} entries before 8 AM`;
    case 'nightOwl':
      return n === 1 ? 'Write after 10 PM' : `${n} entries after 10 PM`;
    case 'weekend':
      return n === 1 ? 'Write on the weekend' : `${n} weekend entries`;
    case 'photoCollection':
      return `${n} photos in one entry`;
    default:
      return achievement.description;
  }
};

const getSvAchievementDescription = (achievement: Achievement): string => {
  const n = achievement.requirement;
  switch (achievement.type) {
    case 'streak':
      return n === 1 ? 'Skriv din forsta anteckning' : `${n} dagars svit`;
    case 'entries':
      return `${n} anteckningar`;
    case 'images':
      return n === 1 ? 'Lagg till din forsta bild' : `${n} bilder`;
    case 'words':
      return `${n} ord totalt`;
    case 'multiDay':
      return `${n} anteckningar samma dag`;
    case 'shared':
      return n === 1 ? 'Dela din forsta anteckning' : `Dela ${n} anteckningar`;
    case 'location':
      return n === 1 ? 'Lagg till plats i en anteckning' : `${n} anteckningar med plats`;
    case 'earlyBird':
      return n === 1 ? 'Skriv fore kl. 8' : `${n} anteckningar fore kl. 8`;
    case 'nightOwl':
      return n === 1 ? 'Skriv efter kl. 22' : `${n} anteckningar efter kl. 22`;
    case 'weekend':
      return n === 1 ? 'Skriv pa helgen' : `${n} helganteckningar`;
    case 'photoCollection':
      return `${n} bilder i en anteckning`;
    default:
      return achievement.description;
  }
};

export const getLocalizedAchievement = (
  achievement: Achievement,
  locale: AchievementLocale,
): Achievement => {
  if (locale === 'fi') return achievement;

  if (locale === 'en') {
    return {
      ...achievement,
      name: getEnAchievementName(achievement),
      description: getEnAchievementDescription(achievement),
    };
  }

  return {
    ...achievement,
    name: getSvAchievementName(achievement),
    description: getSvAchievementDescription(achievement),
  };
};

export const getLocalizedAchievements = (
  list: Achievement[],
  locale: AchievementLocale,
): Achievement[] => list.map((achievement) => getLocalizedAchievement(achievement, locale));

export const calculateStreaks = (entries: DiaryEntry[]): { current: number; longest: number } => {
  if (entries.length === 0) return { current: 0, longest: 0 };

  const toStartOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const toLocalDateKey = (date: Date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const uniqueDatesMap = new Map<string, Date>();
  for (const entry of entries) {
    const entryDate = new Date(entry.date);
    const key = toLocalDateKey(entryDate);
    if (!uniqueDatesMap.has(key)) {
      uniqueDatesMap.set(key, toStartOfDay(entryDate));
    }
  }

  const uniqueDates = Array.from(uniqueDatesMap.values()).sort(
    (a, b) => b.getTime() - a.getTime()
  );

  let currentStreak = 0;
  let longestStreak = 1;
  let tempStreak = 1;

  const today = toStartOfDay(new Date());
  const latestEntry = uniqueDates[0];
  const daysSinceLatest = Math.floor((today.getTime() - latestEntry.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceLatest <= 1) {
    currentStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
      const current = uniqueDates[i - 1];
      const previous = uniqueDates[i];
      const diff = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  for (let i = 1; i < uniqueDates.length; i++) {
    const current = uniqueDates[i - 1];
    const previous = uniqueDates[i];
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
