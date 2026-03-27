import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

export type UserRole = 'owner' | 'editor' | 'viewer';
export type SubscriptionTier = 'Free' | 'Premium';

export type UserContext = {
  familyId: string;
  userId: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  familyMembersCount: number;
};

const USER_CONTEXT_KEY = 'userContext';

const DEFAULT_CONTEXT: UserContext = {
  familyId: 'demo-family',
  userId: 'demo-user',
  role: 'owner',
  subscriptionTier: 'Free',
  familyMembersCount: 1,
};

const normalizeRole = (value: unknown): UserRole => {
  if (value === 'viewer' || value === 'editor' || value === 'owner') {
    return value;
  }
  return 'owner';
};

const normalizeTier = (value: unknown): SubscriptionTier => {
  if (value === 'Premium' || value === 'Free') {
    return value;
  }
  return 'Free';
};

const normalizeMembersCount = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const deriveFromUser = (user: any): UserContext => {
  const metadata = user?.user_metadata ?? user?.raw_user_meta_data ?? {};
  return {
    familyId: String(metadata.family_id ?? DEFAULT_CONTEXT.familyId),
    userId: String(user?.id ?? DEFAULT_CONTEXT.userId),
    role: normalizeRole(metadata.user_role ?? metadata.role),
    subscriptionTier: normalizeTier(metadata.subscription_tier ?? metadata.tier),
    familyMembersCount: normalizeMembersCount(metadata.family_members_count),
  };
};

const persistContext = async (context: UserContext): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Ignore persistence errors.
  }
};

export const getUserContext = async (): Promise<UserContext> => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      const context = deriveFromUser(data.user);
      await persistContext(context);
      return context;
    }
  } catch {
    // Fall through to cache/default.
  }

  try {
    const cached = await AsyncStorage.getItem(USER_CONTEXT_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Partial<UserContext>;
      return {
        familyId: String(parsed.familyId ?? DEFAULT_CONTEXT.familyId),
        userId: String(parsed.userId ?? DEFAULT_CONTEXT.userId),
        role: normalizeRole(parsed.role),
        subscriptionTier: normalizeTier(parsed.subscriptionTier),
        familyMembersCount: normalizeMembersCount(parsed.familyMembersCount),
      };
    }
  } catch {
    // Ignore cache parse failures.
  }

  return DEFAULT_CONTEXT;
};
