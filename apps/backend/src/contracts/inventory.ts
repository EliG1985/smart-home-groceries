export type InventoryStatus = 'In_List' | 'At_Home';
export type UserRole = 'owner' | 'editor' | 'viewer';
export type SubscriptionTier = 'Free' | 'Premium';

export type InventoryItemDto = {
  id: string;
  familyId: string;
  productName: string;
  category: string;
  expiryDate: string;
  status: InventoryStatus;
  price: number;
  quantity: number;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryListResponse = {
  items: InventoryItemDto[];
  total: number;
};

export type InventoryCreateRequest = {
  id?: string;
  product_name?: string;
  productName?: string;
  category?: string;
  expiry_date?: string;
  expiryDate?: string;
  status?: InventoryStatus;
  price?: number;
  quantity?: number;
  added_by?: string;
  addedBy?: string;
};

export type InventoryUpdateRequest = {
  product_name?: string;
  productName?: string;
  category?: string;
  expiry_date?: string;
  expiryDate?: string;
  price?: number;
  quantity?: number;
};

export type InventoryStatusPatchRequest = {
  status?: InventoryStatus;
};

export type InventoryBatchBuyRequest = {
  itemIds?: string[];
};

export type InventoryBatchDeleteRequest = {
  itemIds?: string[];
};

export type ApiError = {
  code: string;
  message: string;
  details?: string[];
};

export type ApiErrorResponse = {
  error: ApiError;
};

export type InventoryBatchBuyResponse = {
  updatedCount: number;
  updatedIds: string[];
};

export type InventoryBatchDeleteResponse = {
  deletedCount: number;
  deletedIds: string[];
};
