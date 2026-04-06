import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { emailDeliveryConfigured, sendInviteEmail } from '../utils/inviteEmailDelivery';
import { buildInviteUrls } from '../utils/inviteLinks';
import { supabase } from '../utils/supabaseClient';
import {
  defaultPermissionsForRole,
  getFamilyId,
  getRequesterRole,
  getRequesterUserId,
  normalizeRole,
  requireAdminRole,
  requireAuthenticatedUser,
  type CollaborationShoppingPermissions,
  type CollaborationUserRole,
} from '../utils/collaborationGuards';

type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
type InviteJoinMode = 'adult' | 'child';

type FamilyMemberRow = {
  id: string;
  family_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: CollaborationUserRole;
  permissions: CollaborationShoppingPermissions;
};

type FamilyInviteRow = {
  id: string;
  family_id: string;
  email: string;
  role: CollaborationUserRole;
  permissions: CollaborationShoppingPermissions;
  token: string;
  invited_by: string;
  status: InviteStatus;
  expires_at: string;
};

type ChatMessageType = 'text' | 'image' | 'audio' | 'suggestion';

type CollaborationMessageRow = {
  id: string;
  family_id: string;
  sender_id: string;
  content: string;
  message_type: ChatMessageType;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type CollaborationActivityRow = {
  id: string;
  family_id: string;
  actor_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const mapInvite = (row: FamilyInviteRow) => ({
  id: row.id,
  token: row.token,
  email: row.email,
  joinMode: isLinkOnlyInvite(row.email) ? ('child' as InviteJoinMode) : ('adult' as InviteJoinMode),
  invitedBy: row.invited_by,
  role: row.role,
  permissions: normalizePermissions(row.permissions, row.role),
  status: row.status,
  expiresAt: row.expires_at,
});

const mapMessage = (row: CollaborationMessageRow) => ({
  id: row.id,
  familyId: row.family_id,
  senderId: row.sender_id,
  content: row.content,
  messageType: row.message_type,
  editedAt: row.edited_at,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapActivity = (row: CollaborationActivityRow) => ({
  id: row.id,
  familyId: row.family_id,
  actorId: row.actor_id,
  eventType: row.event_type,
  entityType: row.entity_type,
  entityId: row.entity_id,
  payload: row.payload,
  createdAt: row.created_at,
});

const router = Router();

const normalizePermissions = (
  candidate: unknown,
  role: CollaborationUserRole,
): CollaborationShoppingPermissions => {
  const defaults = defaultPermissionsForRole(role);
  if (!candidate || typeof candidate !== 'object') {
    return defaults;
  }

  const source = candidate as Partial<CollaborationShoppingPermissions>;
  const read = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  return {
    create: read(source.create, defaults.create),
    edit: read(source.edit, defaults.edit),
    delete: read(source.delete, defaults.delete),
    markDone: read(source.markDone, defaults.markDone),
    viewProgress: read(source.viewProgress, defaults.viewProgress),
  };
};

const mapParticipant = (row: Record<string, unknown>) => ({
  id: String(row.id),
  email: String(row.email),
  fullName: String(row.full_name ?? ''),
  role: normalizeRole(row.role),
  permissions: normalizePermissions(row.permissions, normalizeRole(row.role)),
});

const tokenIsExpired = (iso: string): boolean => {
  const expiry = Date.parse(iso);
  return Number.isFinite(expiry) && expiry < Date.now();
};

const normalizePositiveInt = (value: unknown, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
};

const normalizeMessageType = (value: unknown): ChatMessageType => {
  if (value === 'image' || value === 'audio' || value === 'suggestion') {
    return value;
  }
  return 'text';
};

const errorResponse = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: string[],
) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

const isLinkOnlyInvite = (email: string): boolean => email.endsWith('@invite.local');
const emailMatchesInvite = (inviteEmail: string, userEmail: string | undefined): boolean => {
  if (isLinkOnlyInvite(inviteEmail)) {
    return true;
  }

  return inviteEmail.trim().toLowerCase() === String(userEmail ?? '').trim().toLowerCase();
};

const appendActivityEvent = async (
  familyId: string,
  actorId: string,
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
): Promise<void> => {
  await supabase
    .from('collaboration_activity_log')
    .insert({
      family_id: familyId,
      actor_id: actorId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload: payload ?? {},
    });
};

router.get('/participants', async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);

  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .order('joined_at', { ascending: true });

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  res.json({ participants: (data ?? []).map(mapParticipant) });
});

router.get('/invites', requireAdminRole, async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const requestedStatus = String(req.query.status ?? 'pending').trim().toLowerCase();
  const status: InviteStatus =
    requestedStatus === 'accepted' ||
    requestedStatus === 'declined' ||
    requestedStatus === 'revoked' ||
    requestedStatus === 'expired'
      ? (requestedStatus as InviteStatus)
      : 'pending';

  const { data, error } = await supabase
    .from('family_invites')
    .select('*')
    .eq('family_id', familyId)
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  const invites = ((data ?? []) as FamilyInviteRow[]).map(mapInvite);
  return res.json({ invites, total: invites.length });
});

router.post('/invite', requireAdminRole, async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const invitedBy = getRequesterUserId(req) || 'system';
  const { email, role: rawRole, permissions: rawPermissions } = req.body as {
    email?: string;
    role?: unknown;
    permissions?: unknown;
  };

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({
      error: { code: 'INVALID_EMAIL', message: 'A valid email address is required.' },
    });
  }

  const role = normalizeRole(rawRole);
  const permissions = normalizePermissions(rawPermissions, role);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const { publicInviteUrl } = buildInviteUrls(token);

  const { data: existingPending } = await supabase
    .from('family_invites')
    .select('id')
    .eq('family_id', familyId)
    .ilike('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending?.id) {
    const { error: updateError } = await supabase
      .from('family_invites')
      .update({
        role,
        permissions,
        token,
        invited_by: invitedBy,
        expires_at: expiresAt,
        status: 'pending',
      })
      .eq('id', existingPending.id);

    if (updateError) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: updateError.message },
      });
    }
  } else {
    const { error: insertError } = await supabase
      .from('family_invites')
      .insert({
        family_id: familyId,
        email,
        role,
        permissions,
        token,
        invited_by: invitedBy,
        expires_at: expiresAt,
        status: 'pending',
      });

    if (insertError) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: insertError.message },
      });
    }
  }

  const member = {
    id: `pending_${token.slice(0, 8)}`,
    email,
    fullName: email.split('@')[0],
    role,
    permissions,
  };

  if (!emailDeliveryConfigured()) {
    return res.status(202).json({
      sent: false,
      email,
      member,
      inviteToken: token,
      inviteLink: publicInviteUrl,
      warning:
        'Invite email delivery is not configured. Set SMTP_URL or SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM.',
    });
  }

  try {
    await sendInviteEmail({
      email,
      role,
      inviteUrl: publicInviteUrl,
    });
  } catch (error) {
    return res.status(502).json({
      error: {
        code: 'EMAIL_DELIVERY_FAILED',
        message: error instanceof Error ? error.message : 'Invite email delivery failed.',
      },
    });
  }

  return res.status(202).json({
    sent: true,
    email,
    member,
    inviteToken: token,
    inviteLink: publicInviteUrl,
  });
});

router.post('/invite/link', requireAdminRole, async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const invitedBy = getRequesterUserId(req) || 'system';
  const { role: rawRole, permissions: rawPermissions, label } = req.body as {
    role?: unknown;
    permissions?: unknown;
    label?: unknown;
  };

  const role = normalizeRole(rawRole);
  const permissions = normalizePermissions(rawPermissions, role);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const aliasLabel =
    typeof label === 'string' && label.trim() !== ''
      ? label.trim()
      : `member-${token.slice(0, 6)}`;
  const aliasEmail = `${aliasLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.no-email@invite.local`;

  const { data: existingPendingLink } = await supabase
    .from('family_invites')
    .select('id')
    .eq('family_id', familyId)
    .ilike('email', aliasEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPendingLink?.id) {
    const { error: updateError } = await supabase
      .from('family_invites')
      .update({
        role,
        permissions,
        token,
        invited_by: invitedBy,
        expires_at: expiresAt,
        status: 'pending',
      })
      .eq('id', existingPendingLink.id);

    if (updateError) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: updateError.message },
      });
    }
  } else {
    const { error: insertError } = await supabase
      .from('family_invites')
      .insert({
        family_id: familyId,
        email: aliasEmail,
        role,
        permissions,
        token,
        invited_by: invitedBy,
        expires_at: expiresAt,
        status: 'pending',
      });

    if (insertError) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: insertError.message },
      });
    }
  }

  const { publicInviteUrl } = buildInviteUrls(token);

  return res.status(201).json({
    created: true,
    inviteToken: token,
    inviteLink: publicInviteUrl,
    expiresAt,
    role,
    permissions,
  });
});

router.get('/invites/:token', async (req: Request<{ token: string }>, res: Response) => {
  const token = req.params.token?.trim();
  if (!token) {
    return res.status(400).json({
      error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
    });
  }

  const { data, error } = await supabase
    .from('family_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  if (!data) {
    return res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.' },
    });
  }

  const invite = data as FamilyInviteRow;

  if (invite.status === 'pending' && tokenIsExpired(invite.expires_at)) {
    await supabase
      .from('family_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return res.status(410).json({
      error: { code: 'INVITE_EXPIRED', message: 'Invite token has expired.' },
    });
  }

  return res.json({
    ...mapInvite(invite),
  });
});

router.post('/invites/claim-child', async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? '').trim();
  const displayName = String(req.body?.displayName ?? '').trim();
  const birthday = String(req.body?.birthday ?? '').trim();
  const phone = String(req.body?.phone ?? '').trim();

  if (!token) {
    return res.status(400).json({
      error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
    });
  }

  if (!displayName) {
    return res.status(400).json({
      error: { code: 'INVALID_NAME', message: 'Display name is required.' },
    });
  }

  if (!birthday) {
    return res.status(400).json({
      error: { code: 'INVALID_BIRTHDAY', message: 'Birthday is required.' },
    });
  }

  if (!phone.match(/^\+?\d{7,15}$/)) {
    return res.status(400).json({
      error: { code: 'INVALID_PHONE', message: 'A valid phone number is required.' },
    });
  }

  const { data, error } = await supabase
    .from('family_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  if (!data) {
    return res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.' },
    });
  }

  const invite = data as FamilyInviteRow;
  if (!isLinkOnlyInvite(invite.email)) {
    return res.status(409).json({
      error: { code: 'INVITE_NOT_CHILD', message: 'This invite requires an email account sign-in.' },
    });
  }

  if (invite.status !== 'pending') {
    return res.status(409).json({
      error: { code: 'INVITE_NOT_PENDING', message: `Invite is already ${invite.status}.` },
    });
  }

  if (tokenIsExpired(invite.expires_at)) {
    await supabase
      .from('family_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return res.status(410).json({
      error: { code: 'INVITE_EXPIRED', message: 'Invite token has expired.' },
    });
  }

  const childUserId = `child_${crypto.randomUUID()}`;
  const memberPayload = {
    family_id: invite.family_id,
    user_id: childUserId,
    email: invite.email,
    full_name: displayName,
    role: invite.role,
    permissions: normalizePermissions(invite.permissions, invite.role),
  };

  const { error: memberUpsertError } = await supabase
    .from('family_members')
    .upsert(memberPayload, { onConflict: 'family_id,email' });

  if (memberUpsertError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: memberUpsertError.message },
    });
  }

  const { error: inviteUpdateError } = await supabase
    .from('family_invites')
    .update({
      status: 'accepted',
      accepted_by: childUserId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (inviteUpdateError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: inviteUpdateError.message },
    });
  }

  void appendActivityEvent(invite.family_id, childUserId, 'invite_accepted', 'family_invite', invite.id, {
    role: invite.role,
    childProfile: true,
  });

  return res.json({
    claimed: true,
    childProfile: {
      familyId: invite.family_id,
      userId: childUserId,
      role: invite.role,
      permissions: normalizePermissions(invite.permissions, invite.role),
      displayName,
      birthday,
      phone,
    },
  });
});

router.post('/invites/:inviteId/resend', requireAdminRole, async (req: Request<{ inviteId: string }>, res: Response) => {
  const familyId = getFamilyId(req);
  const inviteId = req.params.inviteId?.trim();

  if (!inviteId) {
    return res.status(400).json({
      error: { code: 'INVALID_INVITE_ID', message: 'Invite ID is required.' },
    });
  }

  const { data, error } = await supabase
    .from('family_invites')
    .select('*')
    .eq('id', inviteId)
    .eq('family_id', familyId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  if (!data) {
    return res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.' },
    });
  }

  const invite = data as FamilyInviteRow;
  if (invite.status === 'accepted') {
    return res.status(409).json({
      error: { code: 'INVITE_NOT_RESENDABLE', message: 'Accepted invite cannot be resent.' },
    });
  }

  const nextToken = crypto.randomBytes(24).toString('hex');
  const nextExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('family_invites')
    .update({
      token: nextToken,
      status: 'pending',
      expires_at: nextExpiry,
    })
    .eq('id', invite.id)
    .eq('family_id', familyId)
    .select('*')
    .single();

  if (updateError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: updateError.message },
    });
  }

  const updatedInvite = updated as FamilyInviteRow;
  if (!isLinkOnlyInvite(updatedInvite.email) && emailDeliveryConfigured()) {
    try {
      await sendInviteEmail({
        email: updatedInvite.email,
        role: updatedInvite.role,
        inviteUrl: buildInviteUrls(updatedInvite.token).publicInviteUrl,
      });
    } catch (error) {
      return res.status(502).json({
        error: {
          code: 'EMAIL_DELIVERY_FAILED',
          message: error instanceof Error ? error.message : 'Invite email delivery failed.',
        },
      });
    }
  }

  if (!isLinkOnlyInvite(updatedInvite.email) && !emailDeliveryConfigured()) {
    return res.json({
      resent: true,
      invite: mapInvite(updatedInvite),
      emailSent: false,
      warning:
        'Invite email delivery is not configured. Set SMTP_URL or SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM.',
    });
  }

  return res.json({ resent: true, invite: mapInvite(updatedInvite) });
});

router.post('/invites/:inviteId/revoke', requireAdminRole, async (req: Request<{ inviteId: string }>, res: Response) => {
  const familyId = getFamilyId(req);
  const inviteId = req.params.inviteId?.trim();

  if (!inviteId) {
    return res.status(400).json({
      error: { code: 'INVALID_INVITE_ID', message: 'Invite ID is required.' },
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from('family_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('family_id', familyId)
    .in('status', ['pending', 'expired'])
    .select('*')
    .maybeSingle();

  if (updateError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: updateError.message },
    });
  }

  if (!updated) {
    return res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Pending/expired invite not found.' },
    });
  }

  return res.json({ revoked: true, invite: mapInvite(updated as FamilyInviteRow) });
});

router.post('/invites/accept', requireAuthenticatedUser, async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? '').trim();
  const userId = getRequesterUserId(req);

  if (!token) {
    return res.status(400).json({
      error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
    });
  }

  const { data, error } = await supabase
    .from('family_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  if (!data) {
    return res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.' },
    });
  }

  const invite = data as FamilyInviteRow;

  if (invite.status !== 'pending') {
    return res.status(409).json({
      error: { code: 'INVITE_NOT_PENDING', message: `Invite is already ${invite.status}.` },
    });
  }

  if (tokenIsExpired(invite.expires_at)) {
    await supabase
      .from('family_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return res.status(410).json({
      error: { code: 'INVITE_EXPIRED', message: 'Invite token has expired.' },
    });
  }

  const adminUserResult = await supabase.auth.admin.getUserById(userId);
  const userRecord = adminUserResult.data?.user;
  if (!emailMatchesInvite(invite.email, userRecord?.email)) {
    return res.status(403).json({
      error: {
        code: 'INVITE_EMAIL_MISMATCH',
        message: 'This invite was issued for a different email address.',
      },
    });
  }

  const email = userRecord?.email || invite.email;
  const fullName =
    String(userRecord?.user_metadata?.full_name ?? '') ||
    email.split('@')[0];

  const memberPayload = {
    family_id: invite.family_id,
    user_id: userId,
    email,
    full_name: fullName,
    role: invite.role,
    permissions: normalizePermissions(invite.permissions, invite.role),
  };

  const { error: memberUpsertError } = await supabase
    .from('family_members')
    .upsert(memberPayload, { onConflict: 'family_id,user_id' });

  if (memberUpsertError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: memberUpsertError.message },
    });
  }

  const { error: inviteUpdateError } = await supabase
    .from('family_invites')
    .update({
      status: 'accepted',
      accepted_by: userId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (inviteUpdateError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: inviteUpdateError.message },
    });
  }

  if (userRecord) {
    const mergedMetadata = {
      ...(userRecord.user_metadata ?? {}),
      family_id: invite.family_id,
      user_role: invite.role,
      permissions: normalizePermissions(invite.permissions, invite.role),
    };

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: mergedMetadata,
    });
  }

  void appendActivityEvent(invite.family_id, userId, 'invite_accepted', 'family_invite', invite.id, {
    role: invite.role,
  });

  return res.json({
    accepted: true,
    familyId: invite.family_id,
    role: invite.role,
    permissions: normalizePermissions(invite.permissions, invite.role),
  });
});

router.post('/invites/decline', requireAuthenticatedUser, async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? '').trim();
  const userId = getRequesterUserId(req);

  if (!token) {
    return res.status(400).json({
      error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
    });
  }

  const { data, error } = await supabase
    .from('family_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  if (!data) {
    return res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.' },
    });
  }

  const invite = data as FamilyInviteRow;
  if (invite.status !== 'pending') {
    return res.status(409).json({
      error: { code: 'INVITE_NOT_PENDING', message: `Invite is already ${invite.status}.` },
    });
  }

  if (tokenIsExpired(invite.expires_at)) {
    await supabase
      .from('family_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);

    return res.status(410).json({
      error: { code: 'INVITE_EXPIRED', message: 'Invite token has expired.' },
    });
  }

  const adminUserResult = await supabase.auth.admin.getUserById(userId);
  const userRecord = adminUserResult.data?.user;
  if (!emailMatchesInvite(invite.email, userRecord?.email)) {
    return res.status(403).json({
      error: {
        code: 'INVITE_EMAIL_MISMATCH',
        message: 'This invite was issued for a different email address.',
      },
    });
  }

  const { error: updateError } = await supabase
    .from('family_invites')
    .update({ status: 'declined' })
    .eq('id', invite.id);

  if (updateError) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: updateError.message },
    });
  }

  void appendActivityEvent(invite.family_id, userId, 'invite_declined', 'family_invite', invite.id, {
    role: invite.role,
  });

  return res.json({ declined: true, token, status: 'declined' });
});

router.delete('/participants/:userId', requireAdminRole, async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      error: { code: 'INVALID_USER_ID', message: 'User ID is required.' },
    });
  }

  if (userId === getRequesterUserId(req)) {
    return res.status(400).json({
      error: { code: 'INVALID_OPERATION', message: 'Admin cannot remove themselves.' },
    });
  }

  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('family_id', familyId)
    .eq('user_id', userId);

  if (error) {
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: error.message },
    });
  }

  return res.json({ removed: true, userId });
});

router.get('/chat/messages', async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const limit = normalizePositiveInt(req.query.limit, 50, 100);
  const cursor = String(req.query.cursor ?? '').trim();

  let query = supabase
    .from('collaboration_messages')
    .select('*')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(res, 500, 'DB_ERROR', error.message);
  }

  const rows = (data ?? []) as CollaborationMessageRow[];
  const messages = rows.map(mapMessage);
  const nextCursor = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
  return res.json({ messages, nextCursor });
});

router.post('/chat/messages', requireAuthenticatedUser, async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const senderId = getRequesterUserId(req);
  const content = String(req.body?.content ?? '').trim();
  const messageType = normalizeMessageType(req.body?.messageType);

  if (!content) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Message content is required.');
  }

  if (content.length > 2000) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Message content is too long.', ['max length is 2000']);
  }

  const { data, error } = await supabase
    .from('collaboration_messages')
    .insert({
      family_id: familyId,
      sender_id: senderId,
      content,
      message_type: messageType,
    })
    .select('*')
    .single();

  if (error) {
    return errorResponse(res, 500, 'DB_ERROR', error.message);
  }

  const message = mapMessage(data as CollaborationMessageRow);
  void appendActivityEvent(familyId, senderId, 'chat_message_sent', 'chat_message', message.id, {
    messageType,
  });

  return res.status(201).json(message);
});

router.patch('/chat/messages/:id', requireAuthenticatedUser, async (req: Request<{ id: string }>, res: Response) => {
  const familyId = getFamilyId(req);
  const requesterId = getRequesterUserId(req);
  const messageId = req.params.id?.trim();
  const content = String(req.body?.content ?? '').trim();

  if (!messageId) {
    return errorResponse(res, 400, 'INVALID_MESSAGE_ID', 'Message id is required.');
  }

  if (!content) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Message content is required.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('collaboration_messages')
    .select('*')
    .eq('id', messageId)
    .eq('family_id', familyId)
    .maybeSingle();

  if (existingError) {
    return errorResponse(res, 500, 'DB_ERROR', existingError.message);
  }

  if (!existing) {
    return errorResponse(res, 404, 'NOT_FOUND', 'Message not found.');
  }

  const existingRow = existing as CollaborationMessageRow;
  if (existingRow.sender_id !== requesterId) {
    return errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Only the sender can edit this message.');
  }

  const { data: updated, error: updateError } = await supabase
    .from('collaboration_messages')
    .update({
      content,
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('family_id', familyId)
    .select('*')
    .single();

  if (updateError) {
    return errorResponse(res, 500, 'DB_ERROR', updateError.message);
  }

  void appendActivityEvent(familyId, requesterId, 'chat_message_edited', 'chat_message', messageId);
  return res.json(mapMessage(updated as CollaborationMessageRow));
});

router.delete('/chat/messages/:id', requireAuthenticatedUser, async (req: Request<{ id: string }>, res: Response) => {
  const familyId = getFamilyId(req);
  const requesterId = getRequesterUserId(req);
  const requesterRole = getRequesterRole(req);
  const messageId = req.params.id?.trim();

  if (!messageId) {
    return errorResponse(res, 400, 'INVALID_MESSAGE_ID', 'Message id is required.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('collaboration_messages')
    .select('*')
    .eq('id', messageId)
    .eq('family_id', familyId)
    .maybeSingle();

  if (existingError) {
    return errorResponse(res, 500, 'DB_ERROR', existingError.message);
  }

  if (!existing) {
    return errorResponse(res, 404, 'NOT_FOUND', 'Message not found.');
  }

  const existingRow = existing as CollaborationMessageRow;
  const allowed = existingRow.sender_id === requesterId || requesterRole === 'admin';
  if (!allowed) {
    return errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Only sender or admin can delete this message.');
  }

  const { error: deleteError } = await supabase
    .from('collaboration_messages')
    .update({
      deleted_at: new Date().toISOString(),
      content: '',
    })
    .eq('id', messageId)
    .eq('family_id', familyId);

  if (deleteError) {
    return errorResponse(res, 500, 'DB_ERROR', deleteError.message);
  }

  void appendActivityEvent(familyId, requesterId, 'chat_message_deleted', 'chat_message', messageId, {
    byRole: requesterRole,
  });
  return res.json({ deleted: true, id: messageId });
});

router.post('/chat/messages/:id/receipt', requireAuthenticatedUser, async (req: Request<{ id: string }>, res: Response) => {
  const familyId = getFamilyId(req);
  const userId = getRequesterUserId(req);
  const messageId = req.params.id?.trim();
  const seen = Boolean(req.body?.seen);

  if (!messageId) {
    return errorResponse(res, 400, 'INVALID_MESSAGE_ID', 'Message id is required.');
  }

  const { data: message, error: messageError } = await supabase
    .from('collaboration_messages')
    .select('id')
    .eq('id', messageId)
    .eq('family_id', familyId)
    .maybeSingle();

  if (messageError) {
    return errorResponse(res, 500, 'DB_ERROR', messageError.message);
  }

  if (!message) {
    return errorResponse(res, 404, 'NOT_FOUND', 'Message not found.');
  }

  const payload = {
    message_id: messageId,
    user_id: userId,
    delivered_at: new Date().toISOString(),
    ...(seen ? { seen_at: new Date().toISOString() } : {}),
  };

  const { error } = await supabase
    .from('collaboration_message_receipts')
    .upsert(payload, { onConflict: 'message_id,user_id' });

  if (error) {
    return errorResponse(res, 500, 'DB_ERROR', error.message);
  }

  return res.status(201).json({ saved: true, messageId, userId, seen });
});

router.get('/activity', async (req: Request, res: Response) => {
  const familyId = getFamilyId(req);
  const limit = normalizePositiveInt(req.query.limit, 50, 100);
  const cursor = String(req.query.cursor ?? '').trim();
  const eventType = String(req.query.eventType ?? '').trim();

  let query = supabase
    .from('collaboration_activity_log')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  if (eventType) {
    query = query.eq('event_type', eventType);
  }

  const { data, error } = await query;
  if (error) {
    return errorResponse(res, 500, 'DB_ERROR', error.message);
  }

  const rows = (data ?? []) as CollaborationActivityRow[];
  const events = rows.map(mapActivity);
  const nextCursor = events.length > 0 ? events[events.length - 1].createdAt : null;
  return res.json({ events, nextCursor });
});

export default router;
