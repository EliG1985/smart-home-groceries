// Shared TypeScript types for SmartHome Groceries

export type InventoryItem = {
  id: string;
  productName: string;
  category: string;
  expiryDate: string;
  status: 'In_List' | 'At_Home';
  price: number;
  quantity: number;
};

export type ShoppingListItem = InventoryItem & {
  addedBy: string;
};

export type InventoryCreatePayload = {
  id?: string;
  productName: string;
  category: string;
  expiryDate: string;
  status: 'In_List' | 'At_Home';
  price: number;
  quantity: number;
  addedBy?: string;
};

export type InventoryUpdatePayload = Partial<
  Pick<InventoryCreatePayload, 'productName' | 'category' | 'expiryDate' | 'price' | 'quantity'>
>;

export type InventoryStatusPatchPayload = {
  status: 'In_List' | 'At_Home';
};

export type InventoryBatchPayload = {
  itemIds: string[];
};

export type InventoryListResponse = {
  items: ShoppingListItem[];
  total: number;
};

export type InventoryBatchBuyResponse = {
  updatedCount: number;
  updatedIds: string[];
};

export type InventoryBatchDeleteResponse = {
  deletedCount: number;
  deletedIds: string[];
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
};

export type BarcodeLookupSource = 'open_food_facts' | 'local_cache' | 'learned_mapping';

export type SuggestionConfidence = 'high' | 'medium' | 'low';

export type ScannedProductCandidate = {
  barcode: string;
  productName: string;
  brand?: string;
  category?: string;
  packageSize?: string;
  imageUrl?: string;
};

export type SmartSuggestion = {
  field: 'category' | 'price' | 'quantity';
  value: string | number;
  confidence: SuggestionConfidence;
  source: BarcodeLookupSource;
  reason?: string;
};

export type BarcodeLookupRequest = {
  barcode: string;
  locale?: string;
  context?: {
    destination?: 'In_List' | 'At_Home';
    storeId?: string;
  };
};

export type BarcodeLookupResponse = {
  traceId: string;
  barcode: string;
  found: boolean;
  product?: ScannedProductCandidate;
  suggestions: SmartSuggestion[];
  source: BarcodeLookupSource;
};

export type BarcodeEnrichRequest = {
  barcode: string;
  productName: string;
  category: string;
  typicalPrice?: number;
  defaultQuantity?: number;
};

export type BarcodeEnrichResponse = {
  saved: boolean;
  barcode: string;
};

export type BarcodeCacheResponse = {
  hit: boolean;
  cachedAt?: string;
  expiresAt?: string;
  value?: BarcodeLookupResponse;
};

export type ChatMessage = {
  id: string;
  familyId: string;
  senderId: string;
  content: string;
  createdAt: string;
  attachments?: string[];
};

export type ReportSummary = {
  month: string;
  total: number;
  byCategory: Record<string, number>;
};

export type StoreItem = {
  id: string;
  name: string;
  type: 'coin_pack' | 'feature_unlock' | 'skin' | 'subscription';
  price: number;
  coinAmount?: number;
};
