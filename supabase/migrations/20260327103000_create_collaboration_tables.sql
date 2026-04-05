-- Migration: collaboration tables for family members + invite acceptance flow

CREATE TABLE IF NOT EXISTS public.family_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    text        NOT NULL,
  user_id      text        NOT NULL,
  email        text        NOT NULL,
  full_name    text        NOT NULL DEFAULT '',
  role         text        NOT NULL DEFAULT 'viewer'
                           CHECK (role IN ('admin', 'editor', 'viewer')),
  permissions  jsonb       NOT NULL DEFAULT
                           '{"create":false,"edit":false,"delete":false,"markDone":true,"viewProgress":true}'::jsonb,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id),
  UNIQUE (family_id, email)
);

CREATE TABLE IF NOT EXISTS public.family_invites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    text        NOT NULL,
  email        text        NOT NULL,
  role         text        NOT NULL DEFAULT 'viewer'
                           CHECK (role IN ('admin', 'editor', 'viewer')),
  permissions  jsonb       NOT NULL DEFAULT
                           '{"create":false,"edit":false,"delete":false,"markDone":true,"viewProgress":true}'::jsonb,
  token        text        NOT NULL UNIQUE,
  invited_by   text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at   timestamptz NOT NULL,
  accepted_by  text,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_members_family_id
  ON public.family_members (family_id);

CREATE INDEX IF NOT EXISTS idx_family_members_user_id
  ON public.family_members (user_id);

CREATE INDEX IF NOT EXISTS idx_family_invites_family_id_status
  ON public.family_invites (family_id, status);

CREATE INDEX IF NOT EXISTS idx_family_invites_email
  ON public.family_invites (lower(email));

CREATE INDEX IF NOT EXISTS idx_family_invites_token
  ON public.family_invites (token);

CREATE UNIQUE INDEX IF NOT EXISTS uq_family_invites_pending_email
  ON public.family_invites (family_id, lower(email))
  WHERE status = 'pending';

-- Ensure the shared updated_at trigger function exists even if prior migrations
-- were not applied in this environment.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_members_updated_at ON public.family_members;
CREATE TRIGGER trg_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_family_invites_updated_at ON public.family_invites;
CREATE TRIGGER trg_family_invites_updated_at
  BEFORE UPDATE ON public.family_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Realtime events for collaboration data.
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_invites;
