-- Migration: normalized supermarket pricing tables for Phase J2 (Real Price Ingestion)
-- Run this in the Supabase SQL editor or via `supabase db push`.
--
-- Table overview:
--   ingestion_runs   — audit log for each import job execution
--   chain_master     — one row per supermarket chain
--   store_master     — one row per physical store, FK to chain_master
--   price_snapshot   — one row per barcode × store × ingestion run (the live price table)
--
-- The Express provider (supermarketPricing.ts) will query these tables instead of
-- the hard-coded SNAPSHOTS array once Phase J2 ingestion is wired up.
-- The API response shape (SupermarketPriceLookupResponse) remains unchanged.

-- ---------------------------------------------------------------------------
-- Ensure the shared updated_at trigger function exists (idempotent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- ingestion_runs
-- Tracks each run of the price ingestion job (source URL, row counts, timing).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url    text        NOT NULL,
  chain_id      text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'success', 'failed')),
  rows_imported integer     NOT NULL DEFAULT 0,
  error_message text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_chain_id
  ON public.ingestion_runs (chain_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status_started
  ON public.ingestion_runs (status, started_at DESC);

-- ---------------------------------------------------------------------------
-- chain_master
-- One row per supermarket chain referenced in price data.
-- chain_id is a stable slug (e.g. 'shufersal', 'rami-levy') — matches the
-- existing API contracts so the provider swap is non-breaking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chain_master (
  chain_id    text        PRIMARY KEY,
  chain_name  text        NOT NULL,
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_chain_master_updated_at ON public.chain_master;
CREATE TRIGGER trg_chain_master_updated_at
  BEFORE UPDATE ON public.chain_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- store_master
-- One row per physical branch (store).  store_id is a stable slug
-- (e.g. 'shufersal-tel-aviv-dizengoff') matching the existing API contracts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_master (
  store_id    text        PRIMARY KEY,
  chain_id    text        NOT NULL REFERENCES public.chain_master (chain_id)
                            ON DELETE CASCADE ON UPDATE CASCADE,
  store_name  text        NOT NULL,
  city        text        NOT NULL DEFAULT '',
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_master_chain_id
  ON public.store_master (chain_id);

CREATE INDEX IF NOT EXISTS idx_store_master_city
  ON public.store_master (lower(city));

DROP TRIGGER IF EXISTS trg_store_master_updated_at ON public.store_master;
CREATE TRIGGER trg_store_master_updated_at
  BEFORE UPDATE ON public.store_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- price_snapshot
-- Core fact table.  Each row is one barcode observed at one store in one run.
-- The ingestion job inserts new rows per run; old rows are kept for history.
-- The "latest" view uses the max(snapshot_at) per (store_id, barcode).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_snapshot (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL REFERENCES public.ingestion_runs (id)
                              ON DELETE CASCADE,
  chain_id      text        NOT NULL REFERENCES public.chain_master (chain_id)
                              ON DELETE CASCADE ON UPDATE CASCADE,
  store_id      text        NOT NULL REFERENCES public.store_master (store_id)
                              ON DELETE CASCADE ON UPDATE CASCADE,
  barcode       text        NOT NULL,
  product_name  text        NOT NULL DEFAULT '',
  price         numeric     NOT NULL CHECK (price >= 0),
  currency      text        NOT NULL DEFAULT 'ILS',
  promo_text    text,
  snapshot_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Primary lookup: latest price for a barcode across all stores.
CREATE INDEX IF NOT EXISTS idx_price_snapshot_barcode_store
  ON public.price_snapshot (barcode, store_id, snapshot_at DESC);

-- Filtered lookup by chain (supports chainIds filter in API request).
CREATE INDEX IF NOT EXISTS idx_price_snapshot_barcode_chain
  ON public.price_snapshot (barcode, chain_id, snapshot_at DESC);

-- Run-level reporting: all rows for a given ingestion run.
CREATE INDEX IF NOT EXISTS idx_price_snapshot_run_id
  ON public.price_snapshot (run_id);

-- ---------------------------------------------------------------------------
-- Convenience view: latest_price_snapshot
-- Returns only the most-recent price row per (store_id, barcode) pair,
-- joined with store and chain metadata.  The backend provider queries this
-- view instead of the raw table to keep queries simple.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.latest_price_snapshot AS
SELECT DISTINCT ON (ps.barcode, ps.store_id)
  ps.id,
  ps.run_id,
  ps.barcode,
  ps.product_name,
  ps.price,
  ps.currency,
  ps.promo_text,
  ps.snapshot_at    AS last_updated,
  sm.store_id,
  sm.store_name,
  sm.city,
  cm.chain_id,
  cm.chain_name
FROM public.price_snapshot  ps
JOIN public.store_master     sm ON sm.store_id  = ps.store_id
JOIN public.chain_master     cm ON cm.chain_id  = ps.chain_id
ORDER BY ps.barcode, ps.store_id, ps.snapshot_at DESC;

-- ---------------------------------------------------------------------------
-- Seed chain_master with the chains already present in the hardcoded snapshot,
-- so existing dev/test flows continue to work without a real ingestion run.
-- The ingestion job will upsert these rows on every run anyway.
-- ---------------------------------------------------------------------------
INSERT INTO public.chain_master (chain_id, chain_name)
VALUES
  ('shufersal', 'Shufersal'),
  ('rami-levy',  'Rami Levy'),
  ('victory',    'Victory')
ON CONFLICT (chain_id) DO UPDATE
  SET chain_name = EXCLUDED.chain_name,
      updated_at = now();

-- Seed store_master with branches from the hardcoded snapshot.
INSERT INTO public.store_master (store_id, chain_id, store_name, city)
VALUES
  ('shufersal-tel-aviv-dizengoff', 'shufersal', 'Dizengoff Center',  'Tel Aviv'),
  ('shufersal-tel-aviv-ibn-gabirol', 'shufersal', 'Ibn Gabirol',     'Tel Aviv'),
  ('rami-levy-jerusalem-talpiot',  'rami-levy',  'Talpiot',          'Jerusalem'),
  ('rami-levy-modiin',             'rami-levy',  'Modiin Center',     'Modiin'),
  ('victory-rishon-hazahav',       'victory',    'Hazahav Mall',      'Rishon LeZion')
ON CONFLICT (store_id) DO UPDATE
  SET store_name = EXCLUDED.store_name,
      city       = EXCLUDED.city,
      chain_id   = EXCLUDED.chain_id,
      updated_at = now();

-- Seed one ingestion_run row so the seed price rows have a valid run_id FK.
DO $$
DECLARE
  v_run_id uuid;
BEGIN
  INSERT INTO public.ingestion_runs (source_url, chain_id, status, rows_imported, finished_at)
  VALUES ('seed://snapshot', 'all', 'success', 5, now())
  RETURNING id INTO v_run_id;

  -- Seed price_snapshot rows that mirror the in-memory SNAPSHOTS array.
  -- These allow the DB-backed provider to serve the same demo data immediately
  -- after migration, before a real ingestion run has been executed.
  INSERT INTO public.price_snapshot
    (run_id, chain_id, store_id, barcode, product_name, price, promo_text, snapshot_at)
  VALUES
    (v_run_id, 'shufersal', 'shufersal-tel-aviv-dizengoff',  '7290000000001', 'Tnuva Milk 3%',      6.9, '2nd unit 50% off',   '2026-03-27 08:00:00+00'),
    (v_run_id, 'rami-levy',  'rami-levy-jerusalem-talpiot',   '7290000000001', 'Tnuva Milk 3%',      6.4, NULL,                 '2026-03-27 08:15:00+00'),
    (v_run_id, 'victory',    'victory-rishon-hazahav',        '7290000000001', 'Tnuva Milk 3%',      6.7, NULL,                 '2026-03-27 08:10:00+00'),
    (v_run_id, 'shufersal', 'shufersal-tel-aviv-ibn-gabirol', '7290012345678', 'Cottage Cheese 5%',  8.9, NULL,                 '2026-03-27 08:00:00+00'),
    (v_run_id, 'rami-levy',  'rami-levy-modiin',              '7290012345678', 'Cottage Cheese 5%',  8.5, 'Club members price', '2026-03-27 08:17:00+00');
END;
$$;
