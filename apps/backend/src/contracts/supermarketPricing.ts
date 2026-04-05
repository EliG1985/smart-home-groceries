export type SupermarketPriceSource = 'clean_room_snapshot';

export type SupermarketPriceLookupRequest = {
  barcode?: string;
  chainIds?: string[];
  city?: string;
  storeId?: string;
  maxResults?: number;
};

export type SupermarketPriceQuoteDto = {
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

export type SupermarketChainDto = {
  id: string;
  name: string;
  cities: string[];
  stores: Array<{
    id: string;
    name: string;
    city: string;
  }>;
};

export type SupermarketPriceLookupResponse = {
  barcode: string;
  found: boolean;
  source: SupermarketPriceSource;
  results: SupermarketPriceQuoteDto[];
  bestPrice?: SupermarketPriceQuoteDto;
  chains: SupermarketChainDto[];
};

export type SupermarketChainsResponse = {
  source: SupermarketPriceSource;
  chains: SupermarketChainDto[];
};

export type ApiError = {
  code: string;
  message: string;
  details?: string[];
};

export type ApiErrorResponse = {
  error: ApiError;
};
