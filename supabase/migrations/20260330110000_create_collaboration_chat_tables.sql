-- Migration: collaboration chat + receipts + activity log tables

CREATE TABLE IF NOT EXISTS public.collaboration_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    text        NOT NULL,
  sender_id    text        NOT NULL,
  content      text        NOT NULL CHECK (char_length(content) > 0),
  message_type text        NOT NULL DEFAULT 'text'
                           CHECK (message_type IN ('text', 'image', 'audio', 'suggestion')),
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collaboration_message_receipts (
  message_id    uuid        NOT NULL REFERENCES public.collaboration_messages(id) ON DELETE CASCADE,
  user_id       text        NOT NULL,
  delivered_at  timestamptz NOT NULL DEFAULT now(),
  seen_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.collaboration_activity_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    text        NOT NULL,
  actor_id     text        NOT NULL,
  event_type   text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    text        NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collab_messages_family_created
  ON public.collaboration_messages (family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collab_messages_sender
  ON public.collaboration_messages (sender_id);

CREATE INDEX IF NOT EXISTS idx_collab_messages_not_deleted
  ON public.collaboration_messages (family_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collab_receipts_user
  ON public.collaboration_message_receipts (user_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_collab_activity_family_created
  ON public.collaboration_activity_log (family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collab_activity_event_type
  ON public.collaboration_activity_log (event_type, created_at DESC);

-- Ensure updated_at trigger function exists.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collab_messages_updated_at ON public.collaboration_messages;
CREATE TRIGGER trg_collab_messages_updated_at
  BEFORE UPDATE ON public.collaboration_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Realtime events for collaboration chat tables.
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_message_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_activity_log;
