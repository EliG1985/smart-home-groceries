-- Migration: create inventory table
-- Run this in the Supabase SQL editor or via `supabase db push`.

CREATE TABLE IF NOT EXISTS public.inventory (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    text        NOT NULL,
  product_name text        NOT NULL,
  category     text        NOT NULL,
  expiry_date  text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'In_List'
                             CHECK (status IN ('In_List', 'At_Home')),
  price        numeric     NOT NULL DEFAULT 0 CHECK (price >= 0),
  quantity     integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_by     text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for the primary query pattern: family + status filter.
CREATE INDEX IF NOT EXISTS idx_inventory_family_status
  ON public.inventory (family_id, status);

-- Trigger to keep updated_at current on every row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON public.inventory;
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Realtime so postgres_changes events fire for this table.
-- If the publication already covers all tables you can skip this line.
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;

-- Row Level Security (disabled here; the Express API enforces family scoping).
-- Enable and add policies if you expose Supabase directly to clients.
-- ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
