import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key format: @unlocked_achievements_{userId}
const ACHIEVEMENT_KEY_PREFIX = '@unlocked_achievements_';

/**
 * Get storage key for specific user
 */
const getStorageKey = (userId: string): string => {
  return `${ACHIEVEMENT_KEY_PREFIX}${userId}`;
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
    await AsyncStorage.setItem(key, JSON.stringify(achievementIds));
  } catch (error) {
    console.error('Error saving unlocked achievements:', error);
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
      const ids = JSON.parse(data);
      return ids;
    }
    return [];
  } catch (error) {
    console.error('Error loading unlocked achievements:', error);
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
    console.error('Error adding unlocked achievement:', error);
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
    console.error('Error clearing unlocked achievements:', error);
  }
};
