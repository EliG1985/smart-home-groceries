export type BarcodeLookupSource = 'open_food_facts' | 'local_cache' | 'learned_mapping';
export type SuggestionConfidence = 'high' | 'medium' | 'low';

export type BarcodeLookupRequest = {
  barcode?: string;
  locale?: string;
  context?: {
    destination?: 'In_List' | 'At_Home';
    storeId?: string;
  };
};

export type ScannedProductCandidateDto = {
  barcode: string;
  productName: string;
  brand?: string;
  category?: string;
  packageSize?: string;
  imageUrl?: string;
};

export type SmartSuggestionDto = {
  field: 'category' | 'price' | 'quantity';
  value: string | number;
  confidence: SuggestionConfidence;
  source: BarcodeLookupSource;
  reason?: string;
};

export type BarcodeLookupResponse = {
  traceId: string;
  barcode: string;
  found: boolean;
  product?: ScannedProductCandidateDto;
  suggestions: SmartSuggestionDto[];
  source: BarcodeLookupSource;
};

export type BarcodeEnrichRequest = {
  barcode?: string;
  productName?: string;
  category?: string;
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

export type ApiError = {
  code: string;
  message: string;
  details?: string[];
};

export type ApiErrorResponse = {
  error: ApiError;
};
