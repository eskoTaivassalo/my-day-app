import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key format: @unlocked_achievements_{userId}
const ACHIEVEMENT_KEY_PREFIX = '@unlocked_achievements_';
const unlockedAchievementsCache = new Map<string, number[]>();

/**
 * Get storage key for specific user
 */
const getStorageKey = (userId: string): string => {
  return `${ACHIEVEMENT_KEY_PREFIX}${userId}`;
};

const normalizeAchievementIds = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return Array.from(new Set(normalized));
};

/**
 * Save unlocked achievement IDs for a user
 */
export const saveUnlockedAchievements = async (
  userId: string,
  achievementIds: number[]
): Promise<void> => {
  try {
    const key = getStorageKey(userId);
    const normalized = normalizeAchievementIds(achievementIds);
    unlockedAchievementsCache.set(userId, normalized);
    await AsyncStorage.setItem(key, JSON.stringify(normalized));
  } catch (error) {
  }
};

/**
 * Get unlocked achievement IDs from fast in-memory cache.
 * Returns null if nothing has been cached yet for this runtime session.
 */
export const getCachedUnlockedAchievementIds = (userId: string): number[] | null => {
  const cached = unlockedAchievementsCache.get(userId);
  return cached ? [...cached] : null;
};

/**
 * Get unlocked achievement IDs for a user
 */
export const getUnlockedAchievementIds = async (userId: string): Promise<number[]> => {
  try {
    const cached = unlockedAchievementsCache.get(userId);
    if (cached) {
      return [...cached];
    }

    const key = getStorageKey(userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      const ids = normalizeAchievementIds(JSON.parse(data));
      unlockedAchievementsCache.set(userId, ids);
      return ids;
    }
    unlockedAchievementsCache.set(userId, []);
    return [];
  } catch (error) {
    return [];
  }
};

/**
 * Add a newly unlocked achievement ID
 */
export const addUnlockedAchievement = async (
  userId: string,
  achievementId: number
): Promise<void> => {
  try {
    const currentIds = await getUnlockedAchievementIds(userId);
    if (!currentIds.includes(achievementId)) {
      currentIds.push(achievementId);
      await saveUnlockedAchievements(userId, currentIds);
    }
  } catch (error) {
  }
};

/**
 * Clear all achievement data for a user (useful for logout)
 */
export const clearUnlockedAchievements = async (userId: string): Promise<void> => {
  try {
    const key = getStorageKey(userId);
    unlockedAchievementsCache.delete(userId);
    await AsyncStorage.removeItem(key);
  } catch (error) {
  }
};
