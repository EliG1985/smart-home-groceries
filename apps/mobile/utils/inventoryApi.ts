import type {
  ApiErrorResponse,
  InventoryBatchBuyResponse,
  InventoryBatchDeleteResponse,
  InventoryBatchPayload,
  InventoryCreatePayload,
  InventoryUpdatePayload,
  InventoryListResponse,
  ShoppingListItem,
} from '../../../shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { getUserContext } from './userContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

type PendingWrite = {
  id: string;
  path: string;
  options: RequestOptions;
  createdAt: string;
};

const WRITE_QUEUE_KEY = 'inventoryPendingWrites';

export class ApiRequestError extends Error {
  code?: string;
  details?: string[];
  status: number;

  constructor(message: string, status: number, code?: string, details?: string[]) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const toSnakeCasePayload = (payload: InventoryCreatePayload) => ({
  id: payload.id,
  product_name: payload.productName,
  category: payload.category,
  expiry_date: payload.expiryDate,
  status: payload.status,
  price: payload.price,
  quantity: payload.quantity,
  added_by: payload.addedBy,
});

const toSnakeCaseUpdatePayload = (payload: InventoryUpdatePayload) => ({
  ...(payload.productName !== undefined ? { product_name: payload.productName } : {}),
  ...(payload.category !== undefined ? { category: payload.category } : {}),
  ...(payload.expiryDate !== undefined ? { expiry_date: payload.expiryDate } : {}),
  ...(payload.price !== undefined ? { price: payload.price } : {}),
  ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
});

const mapInventoryItem = (item: any): ShoppingListItem => ({
  id: String(item.id),
  productName: String(item.productName ?? item.product_name ?? ''),
  category: String(item.category ?? ''),
  expiryDate: String(item.expiryDate ?? item.expiry_date ?? ''),
  status: item.status === 'At_Home' ? 'At_Home' : 'In_List',
  price: Number(item.price ?? 0),
  quantity: Number(item.quantity ?? 1),
  addedBy: String(item.addedBy ?? item.added_by ?? ''),
});

const parseApiError = async (response: Response): Promise<ApiRequestError> => {
  try {
    const json = (await response.json()) as ApiErrorResponse;
    const details = json?.error?.details?.length ? ` (${json.error.details.join(', ')})` : '';
    const message = json?.error?.message || 'Request failed';
    return new ApiRequestError(
      `${message}${details}`,
      response.status,
      json?.error?.code,
      json?.error?.details,
    );
  } catch {
    return new ApiRequestError('Request failed', response.status);
  }
};

const isNetworkError = (error: unknown): boolean => {
  if (error instanceof ApiRequestError) {
    return error.status === 0;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    return lower.includes('network') || lower.includes('fetch') || lower.includes('failed to connect');
  }
  return false;
};

const generateId = (): string => {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const readPendingWrites = async (): Promise<PendingWrite[]> => {
  try {
    const raw = await AsyncStorage.getItem(WRITE_QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as PendingWrite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePendingWrites = async (writes: PendingWrite[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(WRITE_QUEUE_KEY, JSON.stringify(writes));
  } catch {
    // Ignore queue persistence failures.
  }
};

const enqueuePendingWrite = async (path: string, options: RequestOptions): Promise<void> => {
  const existing = await readPendingWrites();
  const payloadHash = JSON.stringify({ path, method: options.method, body: options.body ?? null });

  const duplicate = existing.some(
    (entry) => JSON.stringify({ path: entry.path, method: entry.options.method, body: entry.options.body ?? null }) === payloadHash,
  );

  if (duplicate) {
    return;
  }

  existing.push({
    id: `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    path,
    options,
    createdAt: new Date().toISOString(),
  });

  await savePendingWrites(existing);
};

let replayPromise: Promise<number> | null = null;

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const context = await getUserContext();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-family-id': context.familyId,
      'x-user-id': context.userId,
      'x-user-role': context.role,
      'x-subscription-tier': context.subscriptionTier,
      'x-family-members-count': String(context.familyMembersCount),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const replayPendingInventoryWrites = async (): Promise<number> => {
  if (replayPromise) {
    return replayPromise;
  }

  replayPromise = (async () => {
    const writes = await readPendingWrites();
    if (writes.length === 0) {
      return 0;
    }

    const remaining: PendingWrite[] = [];
    let processed = 0;

    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index];
      try {
        await request<unknown>(write.path, write.options);
        processed += 1;
      } catch (error) {
        if (isNetworkError(error)) {
          remaining.push(write, ...writes.slice(index + 1));
          break;
        }

        // Drop non-network failures to avoid blocking the queue forever.
      }
    }

    await savePendingWrites(remaining);
    return processed;
  })();

  try {
    return await replayPromise;
  } finally {
    replayPromise = null;
  }
};

export const fetchShoppingListItems = async (): Promise<ShoppingListItem[]> => {
  const response = await request<InventoryListResponse>('/api/inventory?status=In_List');
  return response.items.map(mapInventoryItem);
};

export const fetchAtHomeItems = async (): Promise<ShoppingListItem[]> => {
  const response = await request<InventoryListResponse>('/api/inventory?status=At_Home');
  return response.items.map(mapInventoryItem);
};

export const createShoppingListItem = async (payload: InventoryCreatePayload): Promise<ShoppingListItem> => {
  const id = payload.id ?? generateId();
  const apiPayload = toSnakeCasePayload({ ...payload, id });

  try {
    const response = await request<any>('/api/inventory', {
      method: 'POST',
      body: apiPayload,
    });
    return mapInventoryItem(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueuePendingWrite('/api/inventory', {
      method: 'POST',
      body: apiPayload,
    });

    return {
      id,
      productName: payload.productName,
      category: payload.category,
      expiryDate: payload.expiryDate,
      status: payload.status,
      price: payload.price,
      quantity: payload.quantity,
      addedBy: payload.addedBy ?? 'offline-user',
    };
  }
};

export const markItemAsBought = async (itemId: string): Promise<ShoppingListItem> => {
  try {
    const response = await request<any>(`/api/inventory/${itemId}/status`, {
      method: 'PATCH',
      body: { status: 'At_Home' },
    });
    return mapInventoryItem(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueuePendingWrite(`/api/inventory/${itemId}/status`, {
      method: 'PATCH',
      body: { status: 'At_Home' },
    });

    return {
      id: itemId,
      productName: '',
      category: '',
      expiryDate: '',
      status: 'At_Home',
      price: 0,
      quantity: 1,
      addedBy: '',
    };
  }
};

export const moveItemBackToList = async (itemId: string): Promise<ShoppingListItem> => {
  try {
    const response = await request<any>(`/api/inventory/${itemId}/status`, {
      method: 'PATCH',
      body: { status: 'In_List' },
    });
    return mapInventoryItem(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueuePendingWrite(`/api/inventory/${itemId}/status`, {
      method: 'PATCH',
      body: { status: 'In_List' },
    });

    return {
      id: itemId,
      productName: '',
      category: '',
      expiryDate: '',
      status: 'In_List',
      price: 0,
      quantity: 1,
      addedBy: '',
    };
  }
};

export const updateInventoryItem = async (
  itemId: string,
  payload: InventoryUpdatePayload,
): Promise<ShoppingListItem> => {
  const apiPayload = toSnakeCaseUpdatePayload(payload);

  try {
    const response = await request<any>(`/api/inventory/${itemId}`, {
      method: 'PATCH',
      body: apiPayload,
    });
    return mapInventoryItem(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueuePendingWrite(`/api/inventory/${itemId}`, {
      method: 'PATCH',
      body: apiPayload,
    });

    return {
      id: itemId,
      productName: payload.productName ?? '',
      category: payload.category ?? '',
      expiryDate: payload.expiryDate ?? '',
      status: 'In_List',
      price: payload.price ?? 0,
      quantity: payload.quantity ?? 1,
      addedBy: '',
    };
  }
};

export const deleteShoppingListItem = async (itemId: string): Promise<void> => {
  try {
    await request<{ deletedId: string }>(`/api/inventory/${itemId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueuePendingWrite(`/api/inventory/${itemId}`, {
      method: 'DELETE',
    });
  }
};

export const batchBuyShoppingListItems = async (itemIds: string[]): Promise<InventoryBatchBuyResponse> =>
  {
    try {
      return await request<InventoryBatchBuyResponse>('/api/inventory/batch/buy', {
        method: 'POST',
        body: { itemIds } satisfies InventoryBatchPayload,
      });
    } catch (error) {
      if (!isNetworkError(error)) {
        throw error;
      }

      await enqueuePendingWrite('/api/inventory/batch/buy', {
        method: 'POST',
        body: { itemIds } satisfies InventoryBatchPayload,
      });

      return { updatedCount: itemIds.length, updatedIds: itemIds };
    }
  };

export const batchDeleteShoppingListItems = async (
  itemIds: string[],
): Promise<InventoryBatchDeleteResponse> =>
  {
    try {
      return await request<InventoryBatchDeleteResponse>('/api/inventory/batch/delete', {
        method: 'POST',
        body: { itemIds } satisfies InventoryBatchPayload,
      });
    } catch (error) {
      if (!isNetworkError(error)) {
        throw error;
      }

      await enqueuePendingWrite('/api/inventory/batch/delete', {
        method: 'POST',
        body: { itemIds } satisfies InventoryBatchPayload,
      });

      return { deletedCount: itemIds.length, deletedIds: itemIds };
    }
  };

export type InventoryLiveEvent =
  | { type: 'upsert'; item: ShoppingListItem }
  | { type: 'delete'; id: string }
  | { type: 'reload' };

export const subscribeInventoryLiveUpdates = (
  onEvent: (event: InventoryLiveEvent) => void,
  pollIntervalMs: number = 12000,
): (() => void) => {
  const channel = supabase
    .channel('inventory-live-updates')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'inventory' },
      (payload) => {
        onEvent({ type: 'upsert', item: mapInventoryItem(payload.new) });
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'inventory' },
      (payload) => {
        onEvent({ type: 'upsert', item: mapInventoryItem(payload.new) });
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'inventory' },
      (payload) => {
        const id = String((payload.old as Record<string, unknown>).id ?? '');
        if (id) {
          onEvent({ type: 'delete', id });
        }
      },
    )
    .subscribe();

  const intervalId = setInterval(() => {
    onEvent({ type: 'reload' });
  }, pollIntervalMs);

  return () => {
    clearInterval(intervalId);
    supabase.removeChannel(channel);
  };
};
