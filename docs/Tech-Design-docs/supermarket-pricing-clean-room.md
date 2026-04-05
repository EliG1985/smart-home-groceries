# Supermarket Pricing Clean-Room Design

## Goal
Build Israeli supermarket price lookup for SmartHome Groceries without copying or reusing third-party repository code that is restricted for commercial use.

## Legal Boundary
- Use only public supermarket transparency files and official regulations as inputs.
- Do not copy scraper, parser, matcher, or API code from third-party repositories.
- Keep SmartHome implementation in this repository fully authored here.

## Phase 1 Implemented
- Shared supermarket price lookup contracts in shared/types.ts.
- Backend clean-room pricing contracts in apps/backend/src/contracts/supermarketPricing.ts.
- Backend snapshot-backed provider in apps/backend/src/utils/supermarketPricing.ts.
- API endpoints:
  - GET /api/store/chains
  - POST /api/store/prices/by-barcode

## Phase 2 Implemented (Mobile Consumer)
- Mobile API client method added: lookupSupermarketPrice(barcode).
- Shopping list barcode flow now calls supermarket pricing lookup as a non-blocking follow-up.
- Best-price quote card is shown in the add form (chain, price, optional promo text).
- Price field is auto-filled from best quote only when the form still has default price.
- EN/HE localization keys added for best-price copy.

## Current Source Model (Phase J2 Complete)
The implementation now reads live from Supabase normalized tables:
- `chain_master` — chain dimension
- `store_master` — store dimension with city
- `latest_price_snapshot` view — latest price per `(barcode, store_id)`

Seed data matching the original in-memory snapshots is in the migration. Real ingestion takes over from here by running `npm run ingest:prices -- --source=<URL>`.

## Planned Clean-Room Expansion
1. Source discovery
- Identify official transparency file locations per chain.
- Track latest price, promo, and store files.

2. Ingestion
- Download raw files on a schedule.
- Keep file checksum, published time, and chain metadata.

3. Parsing
- Parse raw files into internal normalized records.
- Normalize barcode, store id, chain id, city, product name, and prices.

4. Serving
- Return best price and filtered quotes by barcode.
- Filter by chain, city, and store.
- Expose freshness timestamps.

## Phase J2 Delivered So Far

### Step 1: Normalized Pricing Schema (Delivered)
Migration file:
- `supabase/migrations/20260330000000_create_pricing_tables.sql`

Created objects:
- `public.ingestion_runs`: import audit (status, counts, timing, error_message)
- `public.chain_master`: chain dimension (`chain_id`, `chain_name`)
- `public.store_master`: store dimension (`store_id`, `chain_id`, `city`)
- `public.price_snapshot`: fact table (barcode/store/chain/run/snapshot_at/price)
- `public.latest_price_snapshot` view: latest row per `(barcode, store_id)`

Performance indexes added for:
- barcode + store lookups
- barcode + chain lookups
- run_id reporting
- city filtering

### Step 2: Ingestion Service Scaffold (Delivered)
Implementation files:
- `apps/backend/src/utils/priceIngestion.ts`
- `apps/backend/src/scripts/runPriceIngestion.ts`
- `apps/backend/package.json` scripts:
  - `ingest:prices`
  - `ingest:prices:dry`

Current ingestion behavior:
- fetches source from URL
- parses JSON (array or `{ rows: [] }`) and CSV fallback
- normalizes chain/store/barcode/product/price/snapshot fields
- supports `--dry-run` for validation-only execution
- on full run:
  - inserts `ingestion_runs` row with `running`
  - upserts `chain_master` and `store_master`
  - inserts `price_snapshot` in chunks
  - marks run `success` or `failed` with `error_message`

### Step 3: DB Provider Swap (Delivered)
Implementation files changed:
- `apps/backend/src/utils/supermarketPricing.ts` — full rewrite of provider
- `apps/backend/src/routes/store.ts` — handlers converted to async

Changes:
- Removed static `SNAPSHOTS` array; all data comes from Supabase.
- `getAvailableChains()` is now `async`: runs `Promise.all` over `chain_master` and `store_master` queries.
- `lookupSupermarketPrices()` is now `async`: queries `latest_price_snapshot` view with `.eq`, `.in`, `.ilike`, `.limit`, ordered by `price ASC`.
- `toQuote()` maps `snake_case` DB columns to camelCase DTO fields.
- Both route handlers wrapped in `try/catch`; Supabase errors return `500 DB_ERROR`.
- API response shape unchanged — mobile integration is unaffected.

E2E validation:
- `GET /api/store/chains` → 200, 3 chains from DB.
- `POST /api/store/prices/by-barcode` (barcode `7290000000001`) → 200, `found: true`, `bestPrice` populated, results sorted cheapest-first.
- `POST /api/store/prices/by-barcode` (barcode `"abc"`) → 400, `VALIDATION_ERROR`, `details: ["barcode must be 8 to 14 digits"]`.



### 1) Prepare DB
Run migration in Supabase SQL Editor:
- `supabase/migrations/20260330000000_create_pricing_tables.sql`

### 2) Build backend
- `cd apps/backend`
- `npm run build`

### 3) Dry run (no DB writes)
- `npm run ingest:prices:dry -- --source=<URL_TO_JSON_OR_CSV>`

### 4) Full run (writes to DB)
- `npm run ingest:prices -- --source=<URL_TO_JSON_OR_CSV>`

### 5) Optional flags
- `--chain=<chain-id>`
- `--max-rows=<N>`

## Operational Verification
- Check `public.ingestion_runs` for latest run status and imported row count.
- Query `public.latest_price_snapshot` to verify searchable latest prices.
- Keep existing API contract unchanged while moving to DB provider in Step 3.

## Backend Contract Shape
- POST /api/store/prices/by-barcode
  - input: barcode, optional chainIds, city, storeId, maxResults
  - output: found, bestPrice, results, available chains

## Runtime Flow (Current)
1. User scans or enters barcode.
2. Mobile runs barcode lookup (`/api/barcode/lookup`) and applies product/suggestion data.
3. Mobile runs supermarket price lookup (`/api/store/prices/by-barcode`) without blocking save flow.
4. If best price exists, UI shows quote card and may prefill price.
5. User can still edit values before saving item to inventory routes.

## Why This Helps Now
- Mobile can integrate to a stable store pricing API immediately.
- The backend can evolve from static snapshot data to real ingestion with minimal API churn.
- Legal risk is reduced because the implementation and data-processing logic are authored here.
- Product UX now demonstrates end-to-end barcode + market price assist before ingestion phase is built.
