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
