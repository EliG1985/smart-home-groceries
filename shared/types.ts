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
