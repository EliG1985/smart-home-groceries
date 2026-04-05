"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const inviteEmailDelivery_1 = require("../utils/inviteEmailDelivery");
const inviteLinks_1 = require("../utils/inviteLinks");
const supabaseClient_1 = require("../utils/supabaseClient");
const collaborationGuards_1 = require("../utils/collaborationGuards");
const mapInvite = (row) => ({
    id: row.id,
    token: row.token,
    email: row.email,
    invitedBy: row.invited_by,
    role: row.role,
    permissions: normalizePermissions(row.permissions, row.role),
    status: row.status,
    expiresAt: row.expires_at,
});
const mapMessage = (row) => ({
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
const mapActivity = (row) => ({
    id: row.id,
    familyId: row.family_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload,
    createdAt: row.created_at,
});
const router = (0, express_1.Router)();
const normalizePermissions = (candidate, role) => {
    const defaults = (0, collaborationGuards_1.defaultPermissionsForRole)(role);
    if (!candidate || typeof candidate !== 'object') {
        return defaults;
    }
    const source = candidate;
    const read = (value, fallback) => typeof value === 'boolean' ? value : fallback;
    return {
        create: read(source.create, defaults.create),
        edit: read(source.edit, defaults.edit),
        delete: read(source.delete, defaults.delete),
        markDone: read(source.markDone, defaults.markDone),
        viewProgress: read(source.viewProgress, defaults.viewProgress),
    };
};
const mapParticipant = (row) => ({
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name ?? ''),
    role: (0, collaborationGuards_1.normalizeRole)(row.role),
    permissions: normalizePermissions(row.permissions, (0, collaborationGuards_1.normalizeRole)(row.role)),
});
const tokenIsExpired = (iso) => {
    const expiry = Date.parse(iso);
    return Number.isFinite(expiry) && expiry < Date.now();
};
const normalizePositiveInt = (value, fallback, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(parsed), max);
};
const normalizeMessageType = (value) => {
    if (value === 'image' || value === 'audio' || value === 'suggestion') {
        return value;
    }
    return 'text';
};
const errorResponse = (res, status, code, message, details) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
const isLinkOnlyInvite = (email) => email.endsWith('@invite.local');
const emailMatchesInvite = (inviteEmail, userEmail) => {
    if (isLinkOnlyInvite(inviteEmail)) {
        return true;
    }
    return inviteEmail.trim().toLowerCase() === String(userEmail ?? '').trim().toLowerCase();
};
const appendActivityEvent = async (familyId, actorId, eventType, entityType, entityId, payload) => {
    await supabaseClient_1.supabase
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
router.get('/participants', async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const { data, error } = await supabaseClient_1.supabase
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
router.get('/invites', collaborationGuards_1.requireAdminRole, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const requestedStatus = String(req.query.status ?? 'pending').trim().toLowerCase();
    const status = requestedStatus === 'accepted' ||
        requestedStatus === 'declined' ||
        requestedStatus === 'revoked' ||
        requestedStatus === 'expired'
        ? requestedStatus
        : 'pending';
    const { data, error } = await supabaseClient_1.supabase
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
    const invites = (data ?? []).map(mapInvite);
    return res.json({ invites, total: invites.length });
});
router.post('/invite', collaborationGuards_1.requireAdminRole, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const invitedBy = (0, collaborationGuards_1.getRequesterUserId)(req) || 'system';
    const { email, role: rawRole, permissions: rawPermissions } = req.body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({
            error: { code: 'INVALID_EMAIL', message: 'A valid email address is required.' },
        });
    }
    const role = (0, collaborationGuards_1.normalizeRole)(rawRole);
    const permissions = normalizePermissions(rawPermissions, role);
    const token = crypto_1.default.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const { publicInviteUrl } = (0, inviteLinks_1.buildInviteUrls)(token);
    const { data: existingPending } = await supabaseClient_1.supabase
        .from('family_invites')
        .select('id')
        .eq('family_id', familyId)
        .ilike('email', email)
        .eq('status', 'pending')
        .maybeSingle();
    if (existingPending?.id) {
        const { error: updateError } = await supabaseClient_1.supabase
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
    }
    else {
        const { error: insertError } = await supabaseClient_1.supabase
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
    try {
        await (0, inviteEmailDelivery_1.sendInviteEmail)({
            email,
            role,
            inviteUrl: publicInviteUrl,
        });
    }
    catch (error) {
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
router.post('/invite/link', collaborationGuards_1.requireAdminRole, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const invitedBy = (0, collaborationGuards_1.getRequesterUserId)(req) || 'system';
    const { role: rawRole, permissions: rawPermissions, label } = req.body;
    const role = (0, collaborationGuards_1.normalizeRole)(rawRole);
    const permissions = normalizePermissions(rawPermissions, role);
    const token = crypto_1.default.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const aliasLabel = typeof label === 'string' && label.trim() !== ''
        ? label.trim()
        : `member-${token.slice(0, 6)}`;
    const aliasEmail = `${aliasLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.no-email@invite.local`;
    const { error: insertError } = await supabaseClient_1.supabase
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
    const { publicInviteUrl } = (0, inviteLinks_1.buildInviteUrls)(token);
    return res.status(201).json({
        created: true,
        inviteToken: token,
        inviteLink: publicInviteUrl,
        expiresAt,
        role,
        permissions,
    });
});
router.get('/invites/:token', async (req, res) => {
    const token = req.params.token?.trim();
    if (!token) {
        return res.status(400).json({
            error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
        });
    }
    const { data, error } = await supabaseClient_1.supabase
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
    const invite = data;
    if (invite.status === 'pending' && tokenIsExpired(invite.expires_at)) {
        await supabaseClient_1.supabase
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
router.post('/invites/:inviteId/resend', collaborationGuards_1.requireAdminRole, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const inviteId = req.params.inviteId?.trim();
    if (!inviteId) {
        return res.status(400).json({
            error: { code: 'INVALID_INVITE_ID', message: 'Invite ID is required.' },
        });
    }
    const { data, error } = await supabaseClient_1.supabase
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
    const invite = data;
    if (invite.status === 'accepted') {
        return res.status(409).json({
            error: { code: 'INVITE_NOT_RESENDABLE', message: 'Accepted invite cannot be resent.' },
        });
    }
    const nextToken = crypto_1.default.randomBytes(24).toString('hex');
    const nextExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const { data: updated, error: updateError } = await supabaseClient_1.supabase
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
    const updatedInvite = updated;
    if (!isLinkOnlyInvite(updatedInvite.email)) {
        try {
            await (0, inviteEmailDelivery_1.sendInviteEmail)({
                email: updatedInvite.email,
                role: updatedInvite.role,
                inviteUrl: (0, inviteLinks_1.buildInviteUrls)(updatedInvite.token).publicInviteUrl,
            });
        }
        catch (error) {
            return res.status(502).json({
                error: {
                    code: 'EMAIL_DELIVERY_FAILED',
                    message: error instanceof Error ? error.message : 'Invite email delivery failed.',
                },
            });
        }
    }
    return res.json({ resent: true, invite: mapInvite(updatedInvite) });
});
router.post('/invites/:inviteId/revoke', collaborationGuards_1.requireAdminRole, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const inviteId = req.params.inviteId?.trim();
    if (!inviteId) {
        return res.status(400).json({
            error: { code: 'INVALID_INVITE_ID', message: 'Invite ID is required.' },
        });
    }
    const { data: updated, error: updateError } = await supabaseClient_1.supabase
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
    return res.json({ revoked: true, invite: mapInvite(updated) });
});
router.post('/invites/accept', collaborationGuards_1.requireAuthenticatedUser, async (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const userId = (0, collaborationGuards_1.getRequesterUserId)(req);
    if (!token) {
        return res.status(400).json({
            error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
        });
    }
    const { data, error } = await supabaseClient_1.supabase
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
    const invite = data;
    if (invite.status !== 'pending') {
        return res.status(409).json({
            error: { code: 'INVITE_NOT_PENDING', message: `Invite is already ${invite.status}.` },
        });
    }
    if (tokenIsExpired(invite.expires_at)) {
        await supabaseClient_1.supabase
            .from('family_invites')
            .update({ status: 'expired' })
            .eq('id', invite.id);
        return res.status(410).json({
            error: { code: 'INVITE_EXPIRED', message: 'Invite token has expired.' },
        });
    }
    const adminUserResult = await supabaseClient_1.supabase.auth.admin.getUserById(userId);
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
    const fullName = String(userRecord?.user_metadata?.full_name ?? '') ||
        email.split('@')[0];
    const memberPayload = {
        family_id: invite.family_id,
        user_id: userId,
        email,
        full_name: fullName,
        role: invite.role,
        permissions: normalizePermissions(invite.permissions, invite.role),
    };
    const { error: memberUpsertError } = await supabaseClient_1.supabase
        .from('family_members')
        .upsert(memberPayload, { onConflict: 'family_id,user_id' });
    if (memberUpsertError) {
        return res.status(500).json({
            error: { code: 'DB_ERROR', message: memberUpsertError.message },
        });
    }
    const { error: inviteUpdateError } = await supabaseClient_1.supabase
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
        await supabaseClient_1.supabase.auth.admin.updateUserById(userId, {
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
router.post('/invites/decline', collaborationGuards_1.requireAuthenticatedUser, async (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const userId = (0, collaborationGuards_1.getRequesterUserId)(req);
    if (!token) {
        return res.status(400).json({
            error: { code: 'INVALID_TOKEN', message: 'Invite token is required.' },
        });
    }
    const { data, error } = await supabaseClient_1.supabase
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
    const invite = data;
    if (invite.status !== 'pending') {
        return res.status(409).json({
            error: { code: 'INVITE_NOT_PENDING', message: `Invite is already ${invite.status}.` },
        });
    }
    if (tokenIsExpired(invite.expires_at)) {
        await supabaseClient_1.supabase
            .from('family_invites')
            .update({ status: 'expired' })
            .eq('id', invite.id);
        return res.status(410).json({
            error: { code: 'INVITE_EXPIRED', message: 'Invite token has expired.' },
        });
    }
    const adminUserResult = await supabaseClient_1.supabase.auth.admin.getUserById(userId);
    const userRecord = adminUserResult.data?.user;
    if (!emailMatchesInvite(invite.email, userRecord?.email)) {
        return res.status(403).json({
            error: {
                code: 'INVITE_EMAIL_MISMATCH',
                message: 'This invite was issued for a different email address.',
            },
        });
    }
    const { error: updateError } = await supabaseClient_1.supabase
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
router.delete('/participants/:userId', collaborationGuards_1.requireAdminRole, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({
            error: { code: 'INVALID_USER_ID', message: 'User ID is required.' },
        });
    }
    if (userId === (0, collaborationGuards_1.getRequesterUserId)(req)) {
        return res.status(400).json({
            error: { code: 'INVALID_OPERATION', message: 'Admin cannot remove themselves.' },
        });
    }
    const { error } = await supabaseClient_1.supabase
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
router.get('/chat/messages', async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const limit = normalizePositiveInt(req.query.limit, 50, 100);
    const cursor = String(req.query.cursor ?? '').trim();
    let query = supabaseClient_1.supabase
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
    const rows = (data ?? []);
    const messages = rows.map(mapMessage);
    const nextCursor = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
    return res.json({ messages, nextCursor });
});
router.post('/chat/messages', collaborationGuards_1.requireAuthenticatedUser, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const senderId = (0, collaborationGuards_1.getRequesterUserId)(req);
    const content = String(req.body?.content ?? '').trim();
    const messageType = normalizeMessageType(req.body?.messageType);
    if (!content) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Message content is required.');
    }
    if (content.length > 2000) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Message content is too long.', ['max length is 2000']);
    }
    const { data, error } = await supabaseClient_1.supabase
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
    const message = mapMessage(data);
    void appendActivityEvent(familyId, senderId, 'chat_message_sent', 'chat_message', message.id, {
        messageType,
    });
    return res.status(201).json(message);
});
router.patch('/chat/messages/:id', collaborationGuards_1.requireAuthenticatedUser, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const requesterId = (0, collaborationGuards_1.getRequesterUserId)(req);
    const messageId = req.params.id?.trim();
    const content = String(req.body?.content ?? '').trim();
    if (!messageId) {
        return errorResponse(res, 400, 'INVALID_MESSAGE_ID', 'Message id is required.');
    }
    if (!content) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Message content is required.');
    }
    const { data: existing, error: existingError } = await supabaseClient_1.supabase
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
    const existingRow = existing;
    if (existingRow.sender_id !== requesterId) {
        return errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Only the sender can edit this message.');
    }
    const { data: updated, error: updateError } = await supabaseClient_1.supabase
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
    return res.json(mapMessage(updated));
});
router.delete('/chat/messages/:id', collaborationGuards_1.requireAuthenticatedUser, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const requesterId = (0, collaborationGuards_1.getRequesterUserId)(req);
    const requesterRole = (0, collaborationGuards_1.getRequesterRole)(req);
    const messageId = req.params.id?.trim();
    if (!messageId) {
        return errorResponse(res, 400, 'INVALID_MESSAGE_ID', 'Message id is required.');
    }
    const { data: existing, error: existingError } = await supabaseClient_1.supabase
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
    const existingRow = existing;
    const allowed = existingRow.sender_id === requesterId || requesterRole === 'admin';
    if (!allowed) {
        return errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Only sender or admin can delete this message.');
    }
    const { error: deleteError } = await supabaseClient_1.supabase
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
router.post('/chat/messages/:id/receipt', collaborationGuards_1.requireAuthenticatedUser, async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const userId = (0, collaborationGuards_1.getRequesterUserId)(req);
    const messageId = req.params.id?.trim();
    const seen = Boolean(req.body?.seen);
    if (!messageId) {
        return errorResponse(res, 400, 'INVALID_MESSAGE_ID', 'Message id is required.');
    }
    const { data: message, error: messageError } = await supabaseClient_1.supabase
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
    const { error } = await supabaseClient_1.supabase
        .from('collaboration_message_receipts')
        .upsert(payload, { onConflict: 'message_id,user_id' });
    if (error) {
        return errorResponse(res, 500, 'DB_ERROR', error.message);
    }
    return res.status(201).json({ saved: true, messageId, userId, seen });
});
router.get('/activity', async (req, res) => {
    const familyId = (0, collaborationGuards_1.getFamilyId)(req);
    const limit = normalizePositiveInt(req.query.limit, 50, 100);
    const cursor = String(req.query.cursor ?? '').trim();
    const eventType = String(req.query.eventType ?? '').trim();
    let query = supabaseClient_1.supabase
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
    const rows = (data ?? []);
    const events = rows.map(mapActivity);
    const nextCursor = events.length > 0 ? events[events.length - 1].createdAt : null;
    return res.json({ events, nextCursor });
});
exports.default = router;
