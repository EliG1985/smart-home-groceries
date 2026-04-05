# Shopping List Implementation Plan

Date: 2026-03-26
Owner: Mobile + Backend
Status: In Progress — Phases A–J mostly complete (testing + RTL verification pending)

## 1. Scope Locked From Docs
- Real-time shared shopping list for family members.
- CRUD operations for list items.
- Batch actions: mark bought and delete selected.
- Sync behavior with pantry via item status (`In_List` <-> `At_Home`).
- Role and premium write guards.
- EN/HE localization and RTL compatibility.
- Offline fallback: local-auth users can access shopping list baseline flow.

## 2. Current Repository Reality

As of 2026-03-27, the following modules are fully implemented and TypeScript-clean:

| File | Status |
|---|---|
| `apps/backend/src/contracts/inventory.ts` | ✅ Complete — all DTO types |
| `apps/backend/src/routes/inventory.ts` | ✅ Complete — CRUD + batch + guards (Supabase-backed) |
| `apps/backend/src/utils/supabaseClient.ts` | ✅ New — backend Supabase client (service role key via env var) |
| `supabase/migrations/20260327000000_create_inventory_table.sql` | ✅ New — inventory table DDL + realtime publication |
| `apps/backend/src/routes/shoppingList.ts` | ✅ Complete — alias to inventory router |
| `apps/backend/src/contracts/supermarketPricing.ts` | ✅ Complete — clean-room supermarket pricing contracts |
| `apps/backend/src/utils/supermarketPricing.ts` | ✅ Complete — DB-backed provider (J2 Step 3) — async reads from `chain_master`, `store_master`, `latest_price_snapshot` |
| `apps/backend/src/routes/store.ts` | ✅ Complete — chains + barcode price lookup routes (async, DB error handling) |
| `apps/backend/src/utils/priceIngestion.ts` | ✅ New (J2 Step 2) — clean-room ingestion engine (fetch → parse → normalize → upsert) |
| `apps/backend/src/scripts/runPriceIngestion.ts` | ✅ New (J2 Step 2) — CLI runner (`--source`, `--chain`, `--max-rows`, `--dry-run`) |
| `supabase/migrations/20260330000000_create_pricing_tables.sql` | ✅ New (J2 Step 1) — normalized pricing schema + indexes + seed data |
| `apps/backend/src/server.ts` | ✅ Updated — mounts `/api/inventory` + `/api/shopping-list` + `/api/store` |
| `shared/types.ts` | ✅ Updated — inventory, barcode, and supermarket pricing types |
| `apps/mobile/utils/inventoryApi.ts` | ✅ Complete — typed API client + realtime subscription + supermarket price lookup |
| `apps/mobile/modules/shoppingList.tsx` | ✅ Complete — full screen with edit, batch, realtime, barcode assist, and best-price card |
| `apps/mobile/modules/inventory.tsx` | ✅ Complete — At_Home screen with expiry badges, edit, realtime |
| `apps/mobile/locales/en.json` | ✅ Updated — shoppingList, inventory, permissions keys |
| `apps/mobile/locales/he.json` | ✅ Updated — same keys in Hebrew |

**Phase F complete:** Backend now writes to the real `public.inventory` Supabase table. Supabase `postgres_changes` events fire end-to-end. Mobile screens reconcile INSERT/UPDATE events by ID (upsert) and DELETE events by ID without a full reload. Both screens re-subscribe when the app returns to the foreground via `AppState`.

## 3. Implementation Checklist

### Phase A: Data Contracts and Types ✅ COMPLETE
- [x] Confirm and freeze `ShoppingListItem` contract in shared types (id, productName, category, expiryDate, status, price, quantity, addedBy).
- [x] Add API DTO types for create/update/patch-status payloads in shared layer.
- [x] Add API response typing for list reads and batch operations.

### Phase B: Backend Shopping List API ✅ COMPLETE (Supabase-backed)
- [x] Wire routes in backend server (`/api/inventory` as primary list/pantry endpoint per PRD).
- [x] Implement `GET /api/inventory` with family scoping and optional status filter.
- [x] Implement `POST /api/inventory` with validation (`product_name`, `category`, `expiry_date`, `price >= 0`, `quantity > 0`, valid status).
- [x] Implement `PATCH /api/inventory/:id` for edit.
- [x] Implement `PATCH /api/inventory/:id/status` for list<->pantry moves.
- [x] Implement `DELETE /api/inventory/:id` for single item delete.
- [x] Add batch endpoint(s): buy selected (set `At_Home`) and delete selected.
- [x] Enforce role guard (viewer cannot write) — returns `403 FORBIDDEN_ROLE`.
- [x] Enforce premium guard for shared-family writes — returns `402 PREMIUM_REQUIRED`.
- [x] Add consistent error shape `{ error: { code, message, details? } }` for mobile handling.

### Phase C: Mobile Data Layer ✅ COMPLETE
- [x] Add inventory/shopping-list API client in mobile utils (`inventoryApi.ts`).
- [x] Add `ApiRequestError` class with `status`, `code`, and `details` fields.
- [x] Add repository/service functions for list CRUD + batch actions.
- [x] Add optimistic update handling with rollback on failure.
- [x] Add offline fallback cache for list reads (AsyncStorage).
- [x] Queued write retries when network restores (offline write queue — Phase G).

### Phase D: Shopping List Screen UI ✅ COMPLETE
- [x] Replace placeholder screen with real module component.
- [x] Render grouped-by-category list sections.
- [x] Add item row actions: details toggle, edit, mark bought, delete.
- [x] Add item selection mode (single/multi-select + select all).
- [x] Add batch action bar for buy/delete selected.
- [x] Add total estimated price summary.
- [x] Add empty state and loading/error states.
- [x] Add add/edit item form with validation and translated inline errors.
- [x] Integrate barcode-assisted add flow and smart suggestions.
- [x] Add best-price supermarket quote card after barcode lookup.

### Phase J: Supermarket Pricing Assist ✅ INITIAL SLICE COMPLETE
- [x] Add backend clean-room supermarket pricing endpoints (`GET /api/store/chains`, `POST /api/store/prices/by-barcode`).
- [x] Add shared request/response contracts in `shared/types.ts`.
- [x] Add mobile non-blocking lookup path after barcode lookup.
- [x] Prefill item price from best quote when form still has default price.
- [x] Add EN/HE localization keys for best-price copy.
- [x] **J2 Step 1:** Add SQL migration for normalized pricing tables + indexes (`supabase/migrations/20260330000000_create_pricing_tables.sql`).
- [x] **J2 Step 2:** Add clean-room ingestion scaffold (`apps/backend/src/utils/priceIngestion.ts`, `apps/backend/src/scripts/runPriceIngestion.ts`, backend npm scripts).
- [x] **J2 Step 3:** Replace snapshot provider in `apps/backend/src/utils/supermarketPricing.ts` with DB-backed reads from normalized tables — `getAvailableChains()` and `lookupSupermarketPrices()` now async; `store.ts` handlers updated with async/await and DB error handling; E2E validated (positive + negative paths).

### Phase E: Pantry Sync Integration ✅ COMPLETE
- [x] Mark bought => `At_Home` — item moves from shopping list to inventory screen.
- [x] Move back to list => `In_List` — item reappears in shopping list.
- [x] Inventory (At_Home) screen implemented with expiry tone badges, inline edit, move-to-list, delete.

### Phase F: Realtime Sync ✅ COMPLETE
- [x] `subscribeInventoryLiveUpdates()` added to `inventoryApi.ts` — subscribes to Supabase `postgres_changes` on `public.inventory` + 12s polling fallback.
- [x] Both Shopping List and Inventory screens subscribe on mount and clean up on unmount.
- [x] Backend routes now write to `public.inventory` Supabase table — `postgres_changes` events fire end-to-end.
- [x] `subscribeInventoryLiveUpdates()` emits typed `InventoryLiveEvent` (`upsert | delete | reload`).
- [x] INSERT/UPDATE events upsert item by ID into local state — no full reload, no duplicates.
- [x] DELETE events remove item by ID from local state.
- [x] `reload` event (polling fallback, 12s) still triggers a full silent reload.
- [x] Both screens re-subscribe on `AppState` change to `'active'` (foreground recovery).
- [x] SQL migration created: `supabase/migrations/20260327000000_create_inventory_table.sql`.

### Phase G: Permissions, Localization, and UX Rules ✅ COMPLETE
- [x] `getActionErrorMessage()` maps `FORBIDDEN_ROLE` / `PREMIUM_REQUIRED` codes to translated strings in both screens.
- [x] `permissions.viewerWriteBlocked` and `permissions.premiumRequired` keys in EN + HE.
- [x] Full EN/HE keys for shopping list labels, actions, errors, and empty states.
- [x] Role-based UI disablement implemented in both screens (add/edit/delete/batch/move actions disabled before API call when write is blocked).
	- [x] Fix `marginRight` → `marginEnd` in `shoppingList.tsx` (checkbox) and `inventory.tsx` (itemName) so spacing auto-mirrors in RTL.
	- [x] Restore stored language and apply RTL (`I18nManager.forceRTL`) before first render in `App.tsx` startup gate.
	- [x] Show restart-required alert in `LanguageSelector` when layout direction changes (EN↔HE flip).
	- [x] Add `settings.rtlRestartTitle` / `rtlRestartBody` keys in EN and HE locales.
- [x] Offline write queue implemented in `inventoryApi.ts` (failed network mutations are queued and replayed on `AppState` foreground and NetInfo reconnect).

### Phase H: Testing and QA 🔲 NOT STARTED
- [ ] Backend tests: validation, role guard, premium guard, family scoping, batch endpoints.
- [ ] Mobile tests: grouped rendering, batch actions, optimistic rollback, offline behavior.
- [ ] Realtime test: two clients, same family, near-real-time propagation (requires Phase F persistence).
- [ ] Regression test: mark bought updates pantry view correctly.
- [ ] Localization test: EN/HE text and RTL alignment on key Shopping List states.

### Phase I: Release Readiness 🔲 NOT STARTED
- [ ] Ensure shopping list CRUD passes mobile release checklist in single-user free mode.
- [ ] Validate no crashes in Android debug/release smoke runs.
- [ ] Update README docs to reflect implemented shopping list routes/screens.

## 4. Next Steps (Priority Order)

### 0. Phase J2 — Real Price Ingestion ✅ COMPLETE
- [x] Build clean-room ingestion job for official transparency files.
- [x] Persist normalized chain/store/price snapshots.
- [x] Keep API shape stable while replacing in-memory snapshot source (DB provider swap done).

### Phase J2 Progress Snapshot (as of 2026-03-30) — ALL STEPS COMPLETE
- ✅ Step 1 complete: normalized pricing schema migration was added.
- ✅ Step 2 complete: ingestion utility + CLI runner were added and compile clean.
- ✅ Step 3 complete: DB provider swap shipped — both endpoints now read from Supabase, API shape unchanged.
- ✅ E2E validation passed: `GET /api/store/chains` returns 3 chains from DB; `POST /api/store/prices/by-barcode` returns correct price sort and `400 VALIDATION_ERROR` for invalid barcode.

### Phase J2 Execution Runbook
Use this runbook when returning to this feature later.

1. Apply pricing schema migration in Supabase SQL Editor:
	- `supabase/migrations/20260330000000_create_pricing_tables.sql`

2. Build backend:
	- `cd apps/backend`
	- `npm run build`

3. Dry-run ingestion (validate parsing/normalization only, no DB writes):
	- `npm run ingest:prices:dry -- --source=<URL_TO_JSON_OR_CSV>`

4. Full ingestion run (writes to `ingestion_runs`, `chain_master`, `store_master`, `price_snapshot`):
	- `npm run ingest:prices -- --source=<URL_TO_JSON_OR_CSV>`

5. Optional ingestion flags:
	- `--chain=<chain-id>` to tag/filter run context.
	- `--max-rows=<N>` to limit rows during controlled tests.

6. Verify ingestion outputs in Supabase:
	- `public.ingestion_runs` for status/row counts/errors.
	- `public.latest_price_snapshot` for latest per `(barcode, store)` view.

### 1. Phase G — RTL Verification ✅ COMPLETE

### 2. Phase H — Tests (NOW HIGHEST PRIORITY)
Once Supabase persistence is wired, add tests:
- Backend: Jest/Supertest for each guarded endpoint.
- Mobile: React Native Testing Library for list rendering and optimistic rollback.
- Integration: Two-client realtime propagation test.

### 3. Phase I — Release Readiness
- Update READMEs.
- Run through `docs/PRDs/Mobile-Release-Checklist.md`.
- Android smoke build + install verification.

## 5. Definition of Done
- Shopping list works end-to-end on device with Supabase-backed persistence.
- Family-scoped realtime sync is stable (events fire from backend writes).
- Role and premium guards are enforced in backend and reflected in UI (pre-call disable + post-call error).
- `In_List`/`At_Home` transitions keep list and pantry consistent.
- EN/HE + RTL verified for all shopping list interactions.
- Tests and manual QA scenarios pass.
