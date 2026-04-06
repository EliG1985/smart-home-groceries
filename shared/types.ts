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

export type CollaborationRole = 'admin' | 'editor' | 'viewer';

export type CollaborationShoppingPermissions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  markDone: boolean;
  viewProgress: boolean;
};

export type CollaborationParticipant = {
  id: string;
  email: string;
  fullName: string;
  role: CollaborationRole;
  permissions: CollaborationShoppingPermissions;
};

export type CollaborationInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type CollaborationInviteJoinMode = 'adult' | 'child';

export type CollaborationInvite = {
  id: string;
  token: string;
  email: string;
  joinMode: CollaborationInviteJoinMode;
  role: CollaborationRole;
  permissions: CollaborationShoppingPermissions;
  status: CollaborationInviteStatus;
  expiresAt: string;
};

export type CollaborationMessageType = 'text' | 'image' | 'audio' | 'suggestion';

export type CollaborationMessage = {
  id: string;
  familyId: string;
  senderId: string;
  content: string;
  messageType: CollaborationMessageType;
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
};

export type CollaborationMessageReceipt = {
  messageId: string;
  userId: string;
  deliveredAt: string;
  seenAt?: string | null;
};

export type CollaborationActivityEventType =
  | 'member_invited'
  | 'invite_accepted'
  | 'invite_revoked'
  | 'member_removed'
  | 'chat_message_sent'
  | 'chat_message_edited'
  | 'chat_message_deleted'
  | 'shopping_item_updated';

export type CollaborationActivityEvent = {
  id: string;
  familyId: string;
  actorId: string;
  eventType: CollaborationActivityEventType;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  createdAt: string;
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

export type SupermarketPriceSource = 'clean_room_snapshot';

export type SupermarketPriceLookupRequest = {
  barcode: string;
  chainIds?: string[];
  city?: string;
  storeId?: string;
  maxResults?: number;
};

export type SupermarketPriceQuote = {
  chainId: string;
  chainName: string;
  storeId: string;
  storeName: string;
  city: string;
  barcode: string;
  productName: string;
  price: number;
  currency: 'ILS';
  promoText?: string;
  lastUpdated: string;
};

export type SupermarketPriceLookupResponse = {
  barcode: string;
  found: boolean;
  source: SupermarketPriceSource;
  results: SupermarketPriceQuote[];
  bestPrice?: SupermarketPriceQuote;
  chains: Array<{
    id: string;
    name: string;
    cities: string[];
    stores: Array<{
      id: string;
      name: string;
      city: string;
    }>;
  }>;
};
