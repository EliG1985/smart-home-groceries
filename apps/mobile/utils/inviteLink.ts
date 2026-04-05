import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLinking from 'expo-linking';

const PENDING_INVITE_TOKEN_KEY = 'pendingInviteToken';

const normalizeDeepLink = (url: string) => {
  const fragmentIndex = url.indexOf('#');
  if (fragmentIndex === -1) {
    return url;
  }

  return `${url.slice(0, fragmentIndex)}?${url.slice(fragmentIndex + 1)}`;
};

const getSingleParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

export const extractInviteTokenFromUrl = (url: string | null): string | null => {
  if (!url || !url.toLowerCase().includes('invite')) {
    return null;
  }

  const parsedUrl = ExpoLinking.parse(normalizeDeepLink(url));
  const normalizedPath = String(parsedUrl.path ?? '').replace(/^\/+|\/+$/g, '');
  const tokenFromQuery = getSingleParam(parsedUrl.queryParams?.token);
  if (tokenFromQuery?.trim()) {
    return tokenFromQuery.trim();
  }

  const pathToken = normalizedPath.match(/^invite\/([^/]+)$/i)?.[1];
  if (pathToken) {
    return decodeURIComponent(pathToken).trim();
  }

  const regexMatch = url.match(/[?&#]token=([^&#]+)/i);
  if (regexMatch?.[1]) {
    return decodeURIComponent(regexMatch[1]).trim();
  }

  const pathRegexMatch = url.match(/\/invite\/([^/?#]+)/i);
  if (pathRegexMatch?.[1]) {
    return decodeURIComponent(pathRegexMatch[1]).trim();
  }

  return null;
};

export const getPendingInviteToken = async (): Promise<string | null> => {
  try {
    return (await AsyncStorage.getItem(PENDING_INVITE_TOKEN_KEY))?.trim() || null;
  } catch {
    return null;
  }
};

export const setPendingInviteToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, token.trim());
  } catch {
    // Ignore persistence failures.
  }
};

export const clearPendingInviteToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch {
    // Ignore persistence failures.
  }
};