import { getUserContext } from './userContext';
import { API_BASE_URL, API_BASE_URL_CANDIDATES } from './apiBaseUrl';
import type { ShoppingPermissions, UserRole } from './userContext';

export type CollabMember = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  permissions: ShoppingPermissions;
};

export type CollaborationMessageType = 'text' | 'image' | 'audio' | 'suggestion';

export type CollaborationChatMessage = {
  id: string;
  familyId: string;
  senderId: string;
  content: string;
  messageType: CollaborationMessageType;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollaborationActivityEvent = {
  id: string;
  familyId: string;
  actorId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

type ParticipantsResponse = { participants: CollabMember[] };
type InviteResponse = {
  sent: boolean;
  email: string;
  member: CollabMember;
  inviteToken: string;
  inviteLink: string;
};
type RemoveResponse = { removed: boolean; userId: string };
type InviteLookupResponse = {
  id: string;
  token: string;
  email: string;
  joinMode: 'adult' | 'child';
  invitedBy?: string;
  role: UserRole;
  permissions: ShoppingPermissions;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
};
type ClaimChildInviteResponse = {
  claimed: boolean;
  childProfile: {
    familyId: string;
    userId: string;
    role: UserRole;
    permissions: ShoppingPermissions;
    displayName: string;
    birthday: string;
    phone: string;
  };
};
type AcceptInviteResponse = {
  accepted: boolean;
  familyId: string;
  role: UserRole;
  permissions: ShoppingPermissions;
};
type DeclineInviteResponse = {
  declined: boolean;
  token: string;
  status: 'declined';
};
type InviteListResponse = {
  invites: InviteLookupResponse[];
  total: number;
};
type ResendInviteResponse = {
  resent: boolean;
  invite: InviteLookupResponse;
};
type RevokeInviteResponse = {
  revoked: boolean;
  invite: InviteLookupResponse;
};
type GenerateInviteLinkResponse = {
  created: boolean;
  inviteToken: string;
  inviteLink: string;
  expiresAt: string;
  role: UserRole;
  permissions: ShoppingPermissions;
};

type ChatMessagesResponse = {
  messages: CollaborationChatMessage[];
  nextCursor: string | null;
};

type ActivityResponse = {
  events: CollaborationActivityEvent[];
  nextCursor: string | null;
};

const REQUEST_TIMEOUT_MS = 8000;
let preferredBaseUrl = API_BASE_URL;

const getOrderedBaseUrls = (): string[] => {
  const list = [preferredBaseUrl, ...API_BASE_URL_CANDIDATES];
  const unique: string[] = [];
  for (const item of list) {
    if (item && !unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique;
};

const isNetworkFailure = (error: unknown): boolean => {
  if ((error as { name?: string })?.name === 'AbortError') {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('network')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('aborted')
  );
};

const collabRequest = async <T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> => {
  const context = await getUserContext();
  let lastError: Error | null = null;

  for (const baseUrl of getOrderedBaseUrls()) {
    const requestUrl = `${baseUrl}${path}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(requestUrl, {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-family-id': context.familyId,
          'x-user-id': context.userId,
          'x-user-role': context.role,
          'x-subscription-tier': context.subscriptionTier,
          'x-family-members-count': String(context.familyMembersCount),
          'x-perm-shopping-create': String(context.permissions.create),
          'x-perm-shopping-edit': String(context.permissions.edit),
          'x-perm-shopping-delete': String(context.permissions.delete),
          'x-perm-shopping-mark-done': String(context.permissions.markDone),
          'x-perm-shopping-view-progress': String(context.permissions.viewProgress),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller?.signal,
      });

      preferredBaseUrl = baseUrl;

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Collaboration request failed (${response.status}): ${text}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      const err =
        (error as { name?: string })?.name === 'AbortError'
          ? new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms (API: ${requestUrl})`)
          : new Error(
            `${error instanceof Error ? error.message : 'Network request failed'} (API: ${requestUrl})`,
          );
      lastError = err;

      if (!isNetworkFailure(error)) {
        throw err;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  throw lastError ?? new Error('Network request failed');
};

const publicCollabRequest = async <T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> => {
  let lastError: Error | null = null;

  for (const baseUrl of getOrderedBaseUrls()) {
    const requestUrl = `${baseUrl}${path}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(requestUrl, {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller?.signal,
      });

      preferredBaseUrl = baseUrl;

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Collaboration request failed (${response.status}): ${text}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      const err =
        (error as { name?: string })?.name === 'AbortError'
          ? new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms (API: ${requestUrl})`)
          : new Error(
            `${error instanceof Error ? error.message : 'Network request failed'} (API: ${requestUrl})`,
          );
      lastError = err;

      if (!isNetworkFailure(error)) {
        throw err;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  throw lastError ?? new Error('Network request failed');
};

export const fetchParticipants = (): Promise<ParticipantsResponse> =>
  collabRequest<ParticipantsResponse>('/api/collaboration/participants');

export const inviteMember = (
  email: string,
  role: UserRole,
  permissions: ShoppingPermissions,
): Promise<InviteResponse> =>
  collabRequest<InviteResponse>('/api/collaboration/invite', {
    method: 'POST',
    body: { email, role, permissions },
  });

export const removeMember = (userId: string): Promise<RemoveResponse> =>
  collabRequest<RemoveResponse>(
    `/api/collaboration/participants/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );

export const lookupInviteByToken = (token: string): Promise<InviteLookupResponse> =>
  collabRequest<InviteLookupResponse>(
    `/api/collaboration/invites/${encodeURIComponent(token)}`,
  );

export const acceptInviteToken = (token: string): Promise<AcceptInviteResponse> =>
  collabRequest<AcceptInviteResponse>('/api/collaboration/invites/accept', {
    method: 'POST',
    body: { token },
  });

export const claimChildInvite = (
  token: string,
  payload: { displayName: string; birthday: string; phone: string },
): Promise<ClaimChildInviteResponse> =>
  publicCollabRequest<ClaimChildInviteResponse>('/api/collaboration/invites/claim-child', {
    method: 'POST',
    body: { token, ...payload },
  });

export const declineInviteToken = (token: string): Promise<DeclineInviteResponse> =>
  collabRequest<DeclineInviteResponse>('/api/collaboration/invites/decline', {
    method: 'POST',
    body: { token },
  });

export const fetchInvites = (
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired' = 'pending',
): Promise<InviteListResponse> =>
  collabRequest<InviteListResponse>(
    `/api/collaboration/invites?status=${encodeURIComponent(status)}`,
  );

export const resendInvite = (inviteId: string): Promise<ResendInviteResponse> =>
  collabRequest<ResendInviteResponse>(
    `/api/collaboration/invites/${encodeURIComponent(inviteId)}/resend`,
    { method: 'POST' },
  );

export const revokeInvite = (inviteId: string): Promise<RevokeInviteResponse> =>
  collabRequest<RevokeInviteResponse>(
    `/api/collaboration/invites/${encodeURIComponent(inviteId)}/revoke`,
    { method: 'POST' },
  );

export const generateInviteLink = (
  role: UserRole,
  permissions: ShoppingPermissions,
  label?: string,
): Promise<GenerateInviteLinkResponse> =>
  collabRequest<GenerateInviteLinkResponse>('/api/collaboration/invite/link', {
    method: 'POST',
    body: { role, permissions, ...(label ? { label } : {}) },
  });

export const fetchChatMessages = (
  cursor?: string,
  limit = 50,
): Promise<ChatMessagesResponse> =>
  collabRequest<ChatMessagesResponse>(
    `/api/collaboration/chat/messages?limit=${encodeURIComponent(String(limit))}${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    }`,
  );

export const sendChatMessage = (
  content: string,
  messageType: CollaborationMessageType = 'text',
): Promise<CollaborationChatMessage> =>
  collabRequest<CollaborationChatMessage>('/api/collaboration/chat/messages', {
    method: 'POST',
    body: { content, messageType },
  });

export const editChatMessage = (
  messageId: string,
  content: string,
): Promise<CollaborationChatMessage> =>
  collabRequest<CollaborationChatMessage>(
    `/api/collaboration/chat/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      body: { content },
    },
  );

export const deleteChatMessage = (
  messageId: string,
): Promise<{ deleted: boolean; id: string }> =>
  collabRequest<{ deleted: boolean; id: string }>(
    `/api/collaboration/chat/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  );

export const saveChatReceipt = (
  messageId: string,
  seen = false,
): Promise<{ saved: boolean; messageId: string; userId: string; seen: boolean }> =>
  collabRequest<{ saved: boolean; messageId: string; userId: string; seen: boolean }>(
    `/api/collaboration/chat/messages/${encodeURIComponent(messageId)}/receipt`,
    {
      method: 'POST',
      body: { seen },
    },
  );

export const fetchCollaborationActivity = (
  cursor?: string,
  limit = 50,
  eventType?: string,
): Promise<ActivityResponse> =>
  collabRequest<ActivityResponse>(
    `/api/collaboration/activity?limit=${encodeURIComponent(String(limit))}${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    }${eventType ? `&eventType=${encodeURIComponent(eventType)}` : ''}`,
  );
