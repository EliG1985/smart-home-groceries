# SmartHome Groceries — Technical PRD (API, Data, Rules, Gaps)

Date: 2026-03-05  
Purpose: Detailed technical PRD for engineering/product alignment.

## 1) Architecture Overview
- Monorepo with two runtime apps:
  - frontend: React + Vite + Redux Toolkit + Tailwind
  - backend: Express + TypeScript + Supabase clients
- Data platform: Supabase Postgres + Storage + RLS + Realtime
- Frontend client chooses backendMode only when API base URL exists and Supabase client is configured.

## 2) Backend API Surface (Implemented)
All `/api/*` routes require auth middleware and use family scope from `users_profile`.

## 2.1 Health
- GET `/health`

## 2.2 Inventory
- GET `/api/inventory`
- POST `/api/inventory`
- PATCH `/api/inventory/:id/status`
- PATCH `/api/inventory/:id`
- DELETE `/api/inventory/:id`

Validation:
- `product_name`, `category`, `expiry_date` required
- `status` in `In_List | At_Home`
- `price >= 0`, `quantity > 0`

Guards:
- role gate: viewer blocked from all inventory writes
- premium gate: if family member count > 1, subscription tier must be Premium

## 2.3 Reports
- GET `/api/reports/summary`
- GET `/api/reports/supermarket-insights?supermarket=<name>`
- POST `/api/reports/supermarket-insights/apply-categories`
- GET `/api/reports/product-price?supermarket=<name>&productName=<name>&barcode=<optional>&fallbackPrice=<optional>`

Behavior:
- If `SUPERMARKET_PRICING_API_URL` exists, attempts external live pricing.
- If unavailable/failing, deterministic internal baseline pricing is used.

## 2.4 Collaboration
- GET `/api/collaboration/participants`
- GET `/api/collaboration/me`
- POST `/api/collaboration/participants/invite-by-email`
- PATCH `/api/collaboration/participants/:memberId/role`
- GET `/api/collaboration/my-invitations`
- POST `/api/collaboration/my-invitations/:id/respond`
- GET `/api/collaboration/chat/messages?limit=100`
- POST `/api/collaboration/chat/messages`
- POST `/api/collaboration/chat/image-urls`
- GET `/api/collaboration/substitutes/suggestions?productName=<name>`
- POST `/api/collaboration/substitutes/learn`
- GET `/api/collaboration/subscription-status`

Guards:
- participant management requires non-viewer
- role update requires owner
- collaboration writes blocked for viewer
- shared collaboration premium requirement enforced

Note:
- Endpoint `auto-invite-by-family-name` is removed in implementation but still referenced in README.

## 3) Frontend Feature Contracts

## 3.1 App State
- Redux slices:
  - auth: current user
  - inventory: items with optimistic move status flow

## 3.2 Tabs
- `list`, `inventory`, `chat`, `store`, `reports`, `participants`, plus header-driven `settings`.

## 3.3 Realtime Contracts
- Inventory updates via `postgres_changes` on `public.inventory` filtered by family.
- Invitations unread updates via `family_invitations` changes for invitee user/email.
- Chat updates via `chat_messages` insert events.

## 3.4 Chat Media Contract
- Upload destination bucket: `chat-images` (private)
- Message payload supports `attachments[]` with storage path metadata.
- Retrieval uses signed URL batch endpoint and path map.

## 4) Data Model PRD (Supabase)

## 4.1 Tables
- `families`
- `users_profile`
- `products`
- `inventory`
- `family_invitations`
- `chat_messages`
- `chat_message_attachments`
- `product_substitutes`
- `family_subscriptions`

## 4.2 Key Constraints
- role in `owner | editor | viewer`
- subscription_tier in `Free | Premium`
- inventory status in `In_List | At_Home`
- invitations status in `Pending | Accepted | Declined`
- chat kind in `message | decision | system`
- unique substitute tuple on family/original/substitute

## 4.3 RLS Coverage
Enabled on major family-scoped tables and policies enforce:
- family-member read access
- family-member write access (as configured)
- storage object insert/select for authenticated users in `chat-images`

## 4.4 Migrations Included in Schema
- image URL normalization to stable `storage:chat-images/...`
- backfill `image_path` from legacy URL forms
- populate `chat_message_attachments` from existing message image path

## 5) UX/Functional Status Matrix

| Domain | Status | Notes |
|---|---|---|
| Auth shell | Implemented | Local fallback + backend token mode |
| Inventory CRUD | Implemented | Includes edit endpoint + optimistic UI |
| Pantry expiry signals | Implemented | Tone via date-fns helpers |
| Barcode scan + lookup | Implemented | html5-qrcode + Open Food Facts |
| Reports chart | Implemented | Explicit measured sizing to avoid invalid dimensions |
| Supermarket insights | Implemented | Backend + local fallback paths |
| Participants/invites | Implemented | Inbox + role change + premium gate |
| Family chat text/media | Implemented | Signed URL architecture + multi-attachments |
| Voice recording | Implemented | MediaRecorder attachments |
| Substitute learning | Implemented | Learned suggestions + decision flow |
| Unified background skins | Implemented | App-wide background skin state |
| In-app store UX | Demo implemented | Local coin wallet/unlocks only |
| Real payment processing | Not implemented | No provider/webhook/ledger integration |

## 6) Non-Functional Requirements (Current)
- Build: frontend and backend compile successfully.
- Runtime: backend requires Supabase env values for auth-enabled API behavior.
- Local resilience: substantial local fallback behavior exists for non-backend mode.

## 7) Security & Integrity Gaps
1. In-app store wallet is client-side localStorage and can be manipulated.
2. No server ledger for coin credits/debits.
3. No idempotent payment events or webhook signature verification.
4. Feature unlocks are not yet server-authoritative.

## 8) Productionization PRD for In-App Purchases

## 8.1 Required Backend Entities
- `wallets(user_id, balance)`
- `coin_packages(id, price, coin_amount, active)`
- `payment_transactions(id, provider_ref, user_id, status, amount, currency, created_at)`
- `coin_ledger(id, user_id, delta, reason, ref_id, created_at)`
- `store_items(id, sku, type, coin_price, active)`
- `user_unlocks(user_id, item_id, unlocked_at)`

## 8.2 Required Endpoints
- POST `/api/store/checkout-session`
- POST `/api/store/webhook` (provider signed)
- GET `/api/store/wallet`
- GET `/api/store/catalog`
- POST `/api/store/unlock`
- GET `/api/store/unlocks`

## 8.3 Purchase Lifecycle
1. Client requests checkout session for package.
2. Backend creates provider checkout token/session.
3. Provider redirects user to payment screen.
4. Provider webhook confirms payment.
5. Backend writes transaction + ledger + wallet update atomically.
6. Client refreshes wallet and unlocks items via secure API.

## 8.4 Acceptance Criteria for Production Store
- Coins only credited after verified webhook event.
- Unlock requests fail without sufficient server wallet balance.
- Duplicate webhook events do not duplicate credits.
- Client-side balance never treated as source of truth.

## 9) QA Scenarios (High Priority)
- Viewer attempts inventory write => 403.
- Shared family without Premium attempts collaboration write => 402.
- Accept invitation moves user to new family scope.
- Chat attachment path outside family prefix not signed.
- Voice recording start/stop sends playable attachment.
- Reports panel does not emit chart width/height warning on mount.

## 10) Documentation Gaps to Reconcile
- README still references removed auto-invite endpoint.
- README phase notes mention previous drawer UX; current implementation is dedicated chat tab.
- Store demo status should be explicitly marked as non-production.

## 11) Recommended Next Engineering Milestones
1. Build secure store backend and migrate UI from local wallet to API wallet.
2. Add E2E tests for invite accept path and family scope reassignment.
3. Add contract tests for premium/role gates on all write routes.
4. Add chat upload constraints (MIME allow-list, size validation, optional scanning).
5. Add centralized analytics/error tracking for realtime and upload failures.

---
This PRD is intentionally implementation-first: it documents what currently exists, what is demo-only, and what must be completed for production-grade readiness.
