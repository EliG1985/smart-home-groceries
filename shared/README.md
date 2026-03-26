# Shared Types & Utilities

Shared TypeScript types and utility functions used by both the mobile app and the backend.

---

## Files

### `types.ts`

Core domain types shared across mobile and backend:

| Type | Description |
|------|-------------|
| `InventoryItem` | A grocery item with `id`, `productName`, `category`, `expiryDate`, `status` (`In_List` \| `At_Home`), `price`, `quantity` |
| `ShoppingListItem` | Extends `InventoryItem` with `addedBy` (user identifier) |
| `ChatMessage` | Family chat message with `id`, `familyId`, `senderId`, `content`, `createdAt`, optional `attachments` |
| `ReportSummary` | Monthly spending summary with `month`, `total`, `byCategory` breakdown |
| `StoreItem` | In-app store item with `id`, `name`, `type` (`coin_pack` \| `feature_unlock` \| `skin` \| `subscription`), `price`, optional `coinAmount` |

### `utils.ts`

Shared utility functions (extend as needed).

---

## Usage

```typescript
import type { InventoryItem, ShoppingListItem } from '../../shared/types';
```

Import using relative paths from each app, or configure `tsconfig.base.json` path aliases for convenience.