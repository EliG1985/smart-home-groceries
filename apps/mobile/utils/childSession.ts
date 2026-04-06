import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { UserContext } from './userContext';

export type ChildSession = {
  context: UserContext;
  displayName: string;
  birthday: string;
  phone: string;
  pinHash: string;
  createdAt: string;
};

const CHILD_SESSION_KEY = 'childSession';

export const hashChildPin = async (pin: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin.trim());

export const getChildSession = async (): Promise<ChildSession | null> => {
  try {
    const stored = await AsyncStorage.getItem(CHILD_SESSION_KEY);
    if (!stored) {
      return null;
    }

    return JSON.parse(stored) as ChildSession;
  } catch {
    return null;
  }
};

export const setChildSession = async (session: ChildSession): Promise<void> => {
  await AsyncStorage.setItem(CHILD_SESSION_KEY, JSON.stringify(session));
};

export const clearChildSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CHILD_SESSION_KEY);
  } catch {
    // Ignore local persistence cleanup failures.
  }
};

export const verifyChildPin = async (pin: string): Promise<boolean> => {
  const session = await getChildSession();
  if (!session) {
    return false;
  }

  return (await hashChildPin(pin)) === session.pinHash;
};
