-- Migration: add RLS policies for collaboration tables

-- Helper functions based on JWT claims.
CREATE OR REPLACE FUNCTION public.current_family_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'family_id',
    auth.jwt() ->> 'family_id',
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT LOWER(COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'user_role',
    auth.jwt() ->> 'user_role',
    ''
  ));
$$;

CREATE OR REPLACE FUNCTION public.can_access_family(target_family_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT target_family_id <> ''
    AND target_family_id = public.current_family_id();
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(target_family_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.can_access_family(target_family_id)
    AND public.current_user_role() IN ('admin', 'owner');
$$;

-- Enable RLS.
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_activity_log ENABLE ROW LEVEL SECURITY;

-- family_members policies.
DROP POLICY IF EXISTS family_members_select_same_family ON public.family_members;
CREATE POLICY family_members_select_same_family
ON public.family_members
FOR SELECT
TO authenticated
USING (public.can_access_family(family_id));

DROP POLICY IF EXISTS family_members_insert_admin_only ON public.family_members;
CREATE POLICY family_members_insert_admin_only
ON public.family_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_family_admin(family_id));

DROP POLICY IF EXISTS family_members_update_admin_only ON public.family_members;
CREATE POLICY family_members_update_admin_only
ON public.family_members
FOR UPDATE
TO authenticated
USING (public.is_family_admin(family_id))
WITH CHECK (public.is_family_admin(family_id));

DROP POLICY IF EXISTS family_members_delete_admin_only ON public.family_members;
CREATE POLICY family_members_delete_admin_only
ON public.family_members
FOR DELETE
TO authenticated
USING (public.is_family_admin(family_id));

-- family_invites policies.
DROP POLICY IF EXISTS family_invites_select_same_family ON public.family_invites;
CREATE POLICY family_invites_select_same_family
ON public.family_invites
FOR SELECT
TO authenticated
USING (public.can_access_family(family_id));

DROP POLICY IF EXISTS family_invites_insert_admin_only ON public.family_invites;
CREATE POLICY family_invites_insert_admin_only
ON public.family_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_family_admin(family_id));

DROP POLICY IF EXISTS family_invites_update_admin_only ON public.family_invites;
CREATE POLICY family_invites_update_admin_only
ON public.family_invites
FOR UPDATE
TO authenticated
USING (public.is_family_admin(family_id))
WITH CHECK (public.is_family_admin(family_id));

DROP POLICY IF EXISTS family_invites_delete_admin_only ON public.family_invites;
CREATE POLICY family_invites_delete_admin_only
ON public.family_invites
FOR DELETE
TO authenticated
USING (public.is_family_admin(family_id));

-- collaboration_messages policies.
DROP POLICY IF EXISTS collaboration_messages_select_same_family ON public.collaboration_messages;
CREATE POLICY collaboration_messages_select_same_family
ON public.collaboration_messages
FOR SELECT
TO authenticated
USING (public.can_access_family(family_id));

DROP POLICY IF EXISTS collaboration_messages_insert_same_family ON public.collaboration_messages;
CREATE POLICY collaboration_messages_insert_same_family
ON public.collaboration_messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_access_family(family_id)
  AND sender_id = auth.uid()::text
);

DROP POLICY IF EXISTS collaboration_messages_update_sender_or_admin ON public.collaboration_messages;
CREATE POLICY collaboration_messages_update_sender_or_admin
ON public.collaboration_messages
FOR UPDATE
TO authenticated
USING (
  public.can_access_family(family_id)
  AND (
    sender_id = auth.uid()::text
    OR public.is_family_admin(family_id)
  )
)
WITH CHECK (
  public.can_access_family(family_id)
  AND (
    sender_id = auth.uid()::text
    OR public.is_family_admin(family_id)
  )
);

DROP POLICY IF EXISTS collaboration_messages_delete_sender_or_admin ON public.collaboration_messages;
CREATE POLICY collaboration_messages_delete_sender_or_admin
ON public.collaboration_messages
FOR DELETE
TO authenticated
USING (
  public.can_access_family(family_id)
  AND (
    sender_id = auth.uid()::text
    OR public.is_family_admin(family_id)
  )
);

-- collaboration_message_receipts policies.
DROP POLICY IF EXISTS collaboration_receipts_select_same_family ON public.collaboration_message_receipts;
CREATE POLICY collaboration_receipts_select_same_family
ON public.collaboration_message_receipts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.collaboration_messages m
    WHERE m.id = collaboration_message_receipts.message_id
      AND public.can_access_family(m.family_id)
  )
);

DROP POLICY IF EXISTS collaboration_receipts_insert_own_for_same_family ON public.collaboration_message_receipts;
CREATE POLICY collaboration_receipts_insert_own_for_same_family
ON public.collaboration_message_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.collaboration_messages m
    WHERE m.id = collaboration_message_receipts.message_id
      AND public.can_access_family(m.family_id)
  )
);

DROP POLICY IF EXISTS collaboration_receipts_update_own_for_same_family ON public.collaboration_message_receipts;
CREATE POLICY collaboration_receipts_update_own_for_same_family
ON public.collaboration_message_receipts
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.collaboration_messages m
    WHERE m.id = collaboration_message_receipts.message_id
      AND public.can_access_family(m.family_id)
  )
)
WITH CHECK (
  user_id = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.collaboration_messages m
    WHERE m.id = collaboration_message_receipts.message_id
      AND public.can_access_family(m.family_id)
  )
);

-- collaboration_activity_log policies.
DROP POLICY IF EXISTS collaboration_activity_select_same_family ON public.collaboration_activity_log;
CREATE POLICY collaboration_activity_select_same_family
ON public.collaboration_activity_log
FOR SELECT
TO authenticated
USING (public.can_access_family(family_id));

DROP POLICY IF EXISTS collaboration_activity_insert_same_family ON public.collaboration_activity_log;
CREATE POLICY collaboration_activity_insert_same_family
ON public.collaboration_activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_access_family(family_id)
  AND actor_id = auth.uid()::text
);

DROP POLICY IF EXISTS collaboration_activity_update_admin_only ON public.collaboration_activity_log;
CREATE POLICY collaboration_activity_update_admin_only
ON public.collaboration_activity_log
FOR UPDATE
TO authenticated
USING (public.is_family_admin(family_id))
WITH CHECK (public.is_family_admin(family_id));

DROP POLICY IF EXISTS collaboration_activity_delete_admin_only ON public.collaboration_activity_log;
CREATE POLICY collaboration_activity_delete_admin_only
ON public.collaboration_activity_log
FOR DELETE
TO authenticated
USING (public.is_family_admin(family_id));
