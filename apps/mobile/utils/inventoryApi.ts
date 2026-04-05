import type {
  ApiErrorResponse,
  BarcodeEnrichRequest,
  BarcodeEnrichResponse,
  BarcodeLookupRequest,
  BarcodeLookupResponse,
  InventoryBatchBuyResponse,
  InventoryBatchDeleteResponse,
  InventoryBatchPayload,
  InventoryCreatePayload,
  InventoryUpdatePayload,
  InventoryListResponse,
  ShoppingListItem,
  SmartSuggestion,
  SupermarketPriceLookupRequest,
  SupermarketPriceLookupResponse,
} from '../../../shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { API_BASE_URL } from './apiBaseUrl';
import { getUserContext } from './userContext';

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
const REQUEST_TIMEOUT_MS = 8000;

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
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-family-id': context.familyId,
        'x-user-id': context.userId,
        'x-user-role': context.role,
        'x-subscription-tier': context.subscriptionTier,
        'x-family-members-count': String(context.familyMembersCount),
        'x-perm-shopping-create': String(context.permissions.create),
        'x-perm-shopping-edit': String(context.permissions.edit),
        'x-perm-shopping-delete': String(context.permissions.delete),
        'x-perm-shopping-mark-done': String(context.permissions.markDone),
        'x-perm-shopping-view-progress': String(context.permissions.viewProgress),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ApiRequestError('Request timeout', 0, 'TIMEOUT');
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

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

const normalizeBarcode = (value: string): string => value.replace(/\D/g, '').trim();

const normalizeCategory = (raw?: string): string | undefined => {
  if (!raw) {
    return undefined;
  }
  const parts = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^en:/i, ''));
  return parts[0] || undefined;
};

const pickLocalizedProductName = (product: Record<string, unknown>, locale?: string): string => {
  const lang = (locale || 'en').toLowerCase();
  const localizedKey = `product_name_${lang}`;
  const localized = String(product[localizedKey] ?? '').trim();
  if (localized) {
    return localized;
  }

  const generic = String(product.product_name ?? '').trim();
  if (generic) {
    return generic;
  }

  const english = String(product.product_name_en ?? '').trim();
  if (english) {
    return english;
  }

  return '';
};

const lookupBarcodeOpenFoodFacts = async (barcode: string, locale?: string): Promise<BarcodeLookupResponse> => {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
  if (!response.ok) {
    throw new ApiRequestError('Open Food Facts lookup failed', response.status);
  }

  const json = (await response.json()) as {
    product?: Record<string, unknown>;
    status?: number;
  };

  const product = json.product;
  if (!product || json.status !== 1) {
    return {
      traceId: `off_${Date.now().toString(36)}`,
      barcode,
      found: false,
      suggestions: [],
      source: 'open_food_facts',
    };
  }

  const productName = pickLocalizedProductName(product, locale);
  if (!productName) {
    return {
      traceId: `off_${Date.now().toString(36)}`,
      barcode,
      found: false,
      suggestions: [],
      source: 'open_food_facts',
    };
  }

  const category = normalizeCategory(String(product.categories_tags ?? product.categories ?? ''));
  const quantityText = String(product.quantity ?? '').trim();
  const parsedQuantity = Number(quantityText.replace(/[^0-9.]/g, ''));

  const suggestions: SmartSuggestion[] = [
    ...(category
      ? [{ field: 'category' as const, value: category, confidence: 'medium' as const, source: 'open_food_facts' as const }]
      : []),
    ...(Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? [{ field: 'quantity' as const, value: parsedQuantity, confidence: 'low' as const, source: 'open_food_facts' as const }]
      : []),
  ];

  return {
    traceId: `off_${Date.now().toString(36)}`,
    barcode,
    found: true,
    source: 'open_food_facts',
    product: {
      barcode,
      productName,
      brand: String(product.brands ?? '').trim() || undefined,
      category,
      packageSize: quantityText || undefined,
      imageUrl: String(product.image_url ?? '').trim() || undefined,
    },
    suggestions,
  };
};

export const lookupBarcode = async (params: {
  barcode: string;
  locale?: string;
  destination?: 'In_List' | 'At_Home';
  storeId?: string;
}): Promise<BarcodeLookupResponse> => {
  const barcode = normalizeBarcode(params.barcode);
  const body: BarcodeLookupRequest = {
    barcode,
    ...(params.locale ? { locale: params.locale } : {}),
    context: {
      destination: params.destination ?? 'In_List',
      ...(params.storeId ? { storeId: params.storeId } : {}),
    },
  };

  try {
    return await request<BarcodeLookupResponse>('/api/barcode/lookup', {
      method: 'POST',
      body,
    });
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    return lookupBarcodeOpenFoodFacts(barcode, params.locale);
  }
};

export const enrichBarcodeMapping = async (payload: {
  barcode: string;
  productName: string;
  category: string;
  typicalPrice?: number;
  defaultQuantity?: number;
}): Promise<BarcodeEnrichResponse> => {
  const body: BarcodeEnrichRequest = {
    barcode: normalizeBarcode(payload.barcode),
    productName: payload.productName.trim(),
    category: payload.category.trim(),
    ...(payload.typicalPrice !== undefined ? { typicalPrice: payload.typicalPrice } : {}),
    ...(payload.defaultQuantity !== undefined ? { defaultQuantity: payload.defaultQuantity } : {}),
  };

  return request<BarcodeEnrichResponse>('/api/barcode/enrich', {
    method: 'POST',
    body,
  });
};

export const lookupSupermarketPrice = async (
  barcode: string,
): Promise<SupermarketPriceLookupResponse | null> => {
  try {
    return await request<SupermarketPriceLookupResponse>('/api/store/prices/by-barcode', {
      method: 'POST',
      body: { barcode } satisfies SupermarketPriceLookupRequest,
    });
  } catch {
    return null;
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
