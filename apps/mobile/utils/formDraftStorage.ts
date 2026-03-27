import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = 'formDraft:';

export const loadDraft = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    const rawValue = await AsyncStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
};

export const saveDraft = async <T>(key: string, value: T): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore persistence failures and keep the form usable.
  }
};

export const clearDraft = async (key: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`${DRAFT_PREFIX}${key}`);
  } catch {
    // Ignore cleanup failures.
  }
};