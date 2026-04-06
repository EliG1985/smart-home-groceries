import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { getChildSession } from './childSession';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type SubscriptionTier = 'Free' | 'Premium';
export type AccountType = 'adult' | 'child';

export type ShoppingPermissions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  markDone: boolean;
  viewProgress: boolean;
};

export type UserContext = {
  familyId: string;
  userId: string;
  fullName: string;
  accountType: AccountType;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  familyMembersCount: number;
  permissions: ShoppingPermissions;
};

const USER_CONTEXT_KEY = 'userContext';

const DEFAULT_CONTEXT: UserContext = {
  familyId: 'demo-family',
  userId: 'demo-user',
  fullName: 'Demo User',
  accountType: 'adult',
  role: 'admin',
  subscriptionTier: 'Free',
  familyMembersCount: 1,
  permissions: {
    create: true,
    edit: true,
    delete: true,
    markDone: true,
    viewProgress: true,
  },
};

const normalizeAccountType = (value: unknown): AccountType => {
  if (value === 'child') {
    return 'child';
  }

  return 'adult';
};

const normalizeRole = (value: unknown): UserRole => {
  if (value === 'owner') {
    return 'admin';
  }
  if (value === 'viewer' || value === 'editor' || value === 'admin') {
    return value;
  }
  return 'admin';
};

const defaultPermissionsForRole = (role: UserRole): ShoppingPermissions => {
  if (role === 'viewer') {
    return {
      create: false,
      edit: false,
      delete: false,
      markDone: true,
      viewProgress: true,
    };
  }

  return {
    create: true,
    edit: true,
    delete: true,
    markDone: true,
    viewProgress: true,
  };
};

const normalizePermissions = (value: unknown, role: UserRole): ShoppingPermissions => {
  const defaults = defaultPermissionsForRole(role);
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const candidate = value as Partial<{
    shopping_create: unknown;
    shopping_edit: unknown;
    shopping_delete: unknown;
    shopping_mark_done: unknown;
    shopping_view_progress: unknown;
    create: unknown;
    edit: unknown;
    delete: unknown;
    markDone: unknown;
    viewProgress: unknown;
  }>;

  const toBool = (input: unknown, fallback: boolean): boolean =>
    typeof input === 'boolean' ? input : fallback;

  return {
    create: toBool(candidate.shopping_create ?? candidate.create, defaults.create),
    edit: toBool(candidate.shopping_edit ?? candidate.edit, defaults.edit),
    delete: toBool(candidate.shopping_delete ?? candidate.delete, defaults.delete),
    markDone: toBool(candidate.shopping_mark_done ?? candidate.markDone, defaults.markDone),
    viewProgress: toBool(candidate.shopping_view_progress ?? candidate.viewProgress, defaults.viewProgress),
  };
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
  const role = normalizeRole(metadata.user_role ?? metadata.role);
  return {
    familyId: String(metadata.family_id ?? DEFAULT_CONTEXT.familyId),
    userId: String(user?.id ?? DEFAULT_CONTEXT.userId),
    fullName: String(metadata.full_name ?? user?.email ?? DEFAULT_CONTEXT.fullName),
    accountType: 'adult',
    role,
    subscriptionTier: normalizeTier(metadata.subscription_tier ?? metadata.tier),
    familyMembersCount: normalizeMembersCount(metadata.family_members_count),
    permissions: normalizePermissions(metadata.permissions, role),
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
    const childSession = await getChildSession();
    if (childSession?.context) {
      return childSession.context;
    }
  } catch {
    // Fall through to Supabase and cached context.
  }

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
        fullName: String(parsed.fullName ?? DEFAULT_CONTEXT.fullName),
        accountType: normalizeAccountType(parsed.accountType),
        role: normalizeRole(parsed.role),
        subscriptionTier: normalizeTier(parsed.subscriptionTier),
        familyMembersCount: normalizeMembersCount(parsed.familyMembersCount),
        permissions: normalizePermissions(
          (parsed as Partial<UserContext>).permissions,
          normalizeRole(parsed.role),
        ),
      };
    }
  } catch {
    // Ignore cache parse failures.
  }

  return DEFAULT_CONTEXT;
};
