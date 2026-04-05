# Shopping List Backend Route Contracts

Date: 2026-03-27
Status: Implemented (Supabase-backed inventory + clean-room snapshot store pricing)
Base URL: /api

## 1. Auth/Context Headers (Current Scaffold)
Current implementation uses request headers for family scoping and write-guard checks:
- `x-family-id` (string): family scope identifier. Default: `demo-family`.
- `x-user-id` (string): user identifier. Default: `demo-user`.
- `x-user-role` (`owner | editor | viewer`): write role. Default: `owner`.
- `x-subscription-tier` (`Free | Premium`): plan tier. Default: `Free`.
- `x-family-members-count` (number): family size. Default: `1`.

Guard behavior for write operations:
- `viewer` => `403 FORBIDDEN_ROLE`
- `family_members_count > 1 && subscription_tier != Premium` => `402 PREMIUM_REQUIRED`

## 2. Canonical Entity
```ts
InventoryItemDto = {
  id: string;
  familyId: string;
  productName: string;
  category: string;
  expiryDate: string; // ISO date
  status: 'In_List' | 'At_Home';
  price: number;      // >= 0
  quantity: number;   // > 0
  addedBy: string;
  createdAt: string;  // ISO datetime
  updatedAt: string;  // ISO datetime
}
```

## 3. Routes

### 3.1 GET /api/inventory
Query params:
- `status` (optional): `In_List | At_Home`

Response `200`:
```json
{
  "items": ["InventoryItemDto"],
  "total": 1
}
```

### 3.2 POST /api/inventory
Request body (supports snake_case and camelCase keys):
```json
{
  "product_name": "Milk",
  "category": "Dairy",
  "expiry_date": "2026-04-01",
  "status": "In_List",
  "price": 6.5,
  "quantity": 2,
  "added_by": "user-1"
}
```

Required validations:
- `product_name` required
- `category` required
- `expiry_date` must be a valid date when provided
- `expiry_date` is required for `At_Home` items
- `status` in `In_List | At_Home`
- `price >= 0`
- `quantity > 0`

Response `201`:
- `InventoryItemDto`

### 3.3 PATCH /api/inventory/:id
Editable fields:
- `product_name | productName`
- `category`
- `expiry_date | expiryDate`
- `price`
- `quantity`

Response:
- `200` updated `InventoryItemDto`
- `404` if not found in current family scope

### 3.4 PATCH /api/inventory/:id/status
Request:
```json
{ "status": "At_Home" }
```

Response:
- `200` updated `InventoryItemDto`
- `400` invalid status
- `404` not found

### 3.5 DELETE /api/inventory/:id
Response `200`:
```json
{ "deletedId": "inv_..." }
```

### 3.6 POST /api/inventory/batch/buy
Request:
```json
{ "itemIds": ["inv_1", "inv_2"] }
```

Behavior:
- Sets `status = At_Home` for matching family-scoped ids.

Response `200`:
```json
{
  "updatedCount": 2,
  "updatedIds": ["inv_1", "inv_2"]
}
```

### 3.7 POST /api/inventory/batch/delete
Request:
```json
{ "itemIds": ["inv_1", "inv_2"] }
```

Response `200`:
```json
{
  "deletedCount": 2,
  "deletedIds": ["inv_1", "inv_2"]
}
```

### 3.8 Compatibility Route
- `/api/shopping-list/*` is currently aliased to `/api/inventory/*`.

### 3.9 GET /api/store/chains
Response `200`:
```json
{
  "source": "clean_room_snapshot",
  "chains": [
    {
      "id": "shufersal",
      "name": "Shufersal",
      "cities": ["Tel Aviv"],
      "stores": [
        { "id": "shufersal-tlv-001", "name": "Shufersal Dizengoff", "city": "Tel Aviv" }
      ]
    }
  ]
}
```

### 3.10 POST /api/store/prices/by-barcode
Request:
```json
{
  "barcode": "7290000000001",
  "chainIds": ["shufersal"],
  "city": "Tel Aviv",
  "storeId": "shufersal-tlv-001",
  "maxResults": 5
}
```

Validation:
- `barcode` must contain 8-14 digits.
- `maxResults` must be between 1 and 20 when provided.

Response `200`:
```json
{
  "barcode": "7290000000001",
  "found": true,
  "source": "clean_room_snapshot",
  "results": [
    {
      "chainId": "shufersal",
      "chainName": "Shufersal",
      "storeId": "shufersal-tlv-001",
      "storeName": "Shufersal Dizengoff",
      "city": "Tel Aviv",
      "barcode": "7290000000001",
      "productName": "Milk 1L",
      "price": 6.9,
      "currency": "ILS",
      "promoText": "2nd item 10% off",
      "lastUpdated": "2026-03-27T00:00:00.000Z"
    }
  ],
  "bestPrice": {
    "chainId": "shufersal",
    "chainName": "Shufersal",
    "storeId": "shufersal-tlv-001",
    "storeName": "Shufersal Dizengoff",
    "city": "Tel Aviv",
    "barcode": "7290000000001",
    "productName": "Milk 1L",
    "price": 6.9,
    "currency": "ILS",
    "promoText": "2nd item 10% off",
    "lastUpdated": "2026-03-27T00:00:00.000Z"
  },
  "chains": []
}
```

## 4. Error Contract
All errors use the same shape:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid inventory create payload.",
    "details": ["product_name is required"]
  }
}
```

Known codes:
- `VALIDATION_ERROR` (400)
- `FORBIDDEN_ROLE` (403)
- `PREMIUM_REQUIRED` (402)
- `NOT_FOUND` (404)
