import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key format: @unlocked_achievements_{userId}
const ACHIEVEMENT_KEY_PREFIX = '@unlocked_achievements_';

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
    await AsyncStorage.setItem(key, JSON.stringify(normalized));
  } catch (error) {
  }
};

/**
 * Get unlocked achievement IDs for a user
 */
export const getUnlockedAchievementIds = async (userId: string): Promise<number[]> => {
  try {
    const key = getStorageKey(userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      const ids = normalizeAchievementIds(JSON.parse(data));
      return ids;
    }
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
    await AsyncStorage.removeItem(key);
  } catch (error) {
  }
};
