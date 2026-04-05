# Family Collaboration

Date: 2026-03-31
Owner: Mobile + Backend
Status: In Progress - Members/invites, in-app invite review with accept/decline, SMTP email invite delivery, HTTPS app/store invite links, chat APIs, realtime chat UI, collaboration RLS, presence/typing, conflict banner + stale-edit recovery, per-item recent-updater attribution, broader rejected-write recovery UX, admin live shopping control actions, and core backend/mobile collaboration tests are implemented; QA hardening remains

## Product Goal
Deliver a professional, family-grade collaboration system where members can communicate in-app, coordinate shopping decisions, and allow admins to monitor and edit the shopping list in realtime with clear permissions and auditability.

## Success Metrics
- 95% of shopping list updates propagate to active family members within 2 seconds.
- 90% of admin actions (edit, move, delete) are reflected across devices without manual refresh.
- At least 50% of active families use in-app collaboration chat weekly.
- Fewer than 1% of collaboration actions fail without a user-visible recovery path.

## Scope
- In scope: family members and invites, role-based permissions, realtime shopping list collaboration, in-app chat, presence, typing indicators, moderation controls, and activity log.
- Out of scope: external social networks, public communities, voice/video calls, and cross-family shared lists.

## Core User Stories
- As an owner/admin, I can see all family shopping list changes in realtime.
- As an owner/admin, I can edit, reassign, mark bought, or delete list items and all members see it instantly.
- As a family member, I can chat with my family inside the app while discussing shopping tasks.
- As a viewer, I can read updates and chat, but cannot perform disallowed write actions.
- As any member, I can understand who changed what and when.

## Role Model
- Owner: full family management, role changes, invite revoke, all list/chat moderation controls.
- Editor: can create/update/delete shopping items and chat.
- Viewer: read-only list access, limited interactions based on permission toggles.

## Collaboration Features

### 1. Family Workspace
- Family identity with family_id as primary collaboration boundary.
- Member list with role, joined_at, and status (active, invited, removed).
- Invite flow: email/link invite, hidden token validation, deep-link capture, in-app review with accept/decline after sign-in, resend, revoke.
- Invite delivery: admin email sends a real SMTP email with HTTPS invite link; invite landing route falls back to store when the app is missing.
- Family-level permission template with optional per-member overrides.

### 2. Realtime Shopping List Control (Admin Priority)
- All shopping list writes are persisted in backend and broadcast over Supabase Realtime.
- Admin sees live feed of creates, edits, status changes, and deletes.
- Admin can edit any item fields: product name, quantity, category, price, expiry, status.
- Admin can bulk act in realtime: mark bought, delete selected, move to inventory.
- Inline lock/conflict strategy for concurrent edits:
	- Last write wins by default.
	- Show non-blocking conflict banner when another user changed the same item recently.
	- Keep optimistic UI rollback when backend rejects changes.

### 3. In-App Family Chat
- Channel scope: one family chat room + optional list-item threaded comments (phase 2).
- Message types: text initially; image/audio as phased enhancement.
- Features: send/edit/delete own message, owner moderation delete for all.
- Realtime typing and presence indicators.
- Read receipts: delivered and seen markers per message.

### 4. Presence and Awareness
- Presence states: online, away, offline.
- Last active timestamp.
- "Currently editing" hint for shopping list items (ephemeral presence channel).

### 5. Activity Log and Auditability
- Immutable collaboration events for important actions:
	- item_created, item_updated, item_deleted, item_bought, role_changed, invite_sent, invite_revoked.
- Admin can inspect recent activity timeline in app.

## Integrations
- Supabase Realtime for list, chat, and presence subscriptions.
- Backend API: /api/collaboration/* for invites, members, roles, chat moderation, activity log.
- Existing inventory/shopping list APIs remain source of truth for item persistence.

## Current Delivery Snapshot (as of 2026-03-31)
- Implemented backend collaboration router mounted at `/api/collaboration`.
- Implemented members/invites endpoints with admin guard, hidden-token accept/decline flow, resend/revoke, and participant removal.
- Implemented collaboration schema for members/invites in Supabase migration.
- Implemented shopping-list family permission enforcement in inventory routes (server-side).
- Implemented mobile Members screen with invite creation, shareable invite links, revoke/resend, permission toggles, and member list.
- Implemented app-level invite deep-link capture with silent pending-token persistence and post-sign-in invite review screen with explicit accept/decline actions.
- Implemented backend SMTP invite delivery for admin email invites and HTTPS invite landing/store fallback routes.
- Implemented chat backend endpoints: list, create, edit, delete, receipts.
- Implemented collaboration activity endpoint and backend activity writes for chat events.
- Implemented reusable collaboration route guards middleware for admin-role and authenticated-user checks.
- Added shared collaboration DTO/types and mobile collaboration API methods for chat/activity.
- Implemented mobile chat screen with send/edit/delete and realtime updates from `collaboration_messages`.
- Added RLS migration for collaboration tables with family-scoped policies and admin-only controls where required.
- Added admin activity timeline section in Members screen using `GET /api/collaboration/activity`.
- Added typing indicators and online/away/offline presence badges in chat using Supabase presence channel.
- Added admin quick actions panel in Members screen for live shopping control (refresh, mark bought, delete).
- Added shopping-list per-item "recently updated by X" attribution indicator for recent realtime changes.
- Added recovery banner flows for rejected writes beyond stale-edit conflicts (retry/dismiss path for failed write actions).
- Not implemented yet: item-level collaboration timeline UI and richer admin bulk/edit actions directly from collaboration panel.

## Suggested Data Model

### Core Tables
- family_members (id, family_id, user_id, role, permissions_json, joined_at, status)
- family_invites (id, family_id, email, role, token, expires_at, status, created_by)
- collaboration_messages (id, family_id, sender_id, content, message_type, edited_at, deleted_at, created_at)
- collaboration_message_receipts (message_id, user_id, delivered_at, seen_at)
- collaboration_activity_log (id, family_id, actor_id, event_type, entity_type, entity_id, payload_json, created_at)

### Realtime Channels
- public.inventory (already active for list/inventory changes)
- public.collaboration_messages (chat stream)
- presence channel per family (typing, online users, editing hints)

## API Contracts (Proposed)

### Members and Invites
- GET /api/collaboration/members
- PATCH /api/collaboration/members/:id/role
- PATCH /api/collaboration/members/:id/permissions
- POST /api/collaboration/invites
- POST /api/collaboration/invites/:id/resend
- DELETE /api/collaboration/invites/:id
- POST /api/collaboration/invites/accept

### Chat
- GET /api/collaboration/chat/messages?cursor=&limit=
- POST /api/collaboration/chat/messages
- PATCH /api/collaboration/chat/messages/:id
- DELETE /api/collaboration/chat/messages/:id
- POST /api/collaboration/chat/messages/:id/receipt

### Activity
- GET /api/collaboration/activity?cursor=&limit=&eventType=

### Error Shape
- Use shared shape: { error: { code, message, details? } }

## Realtime Flow
1. User edits shopping list item.
2. Backend validates role + family scope and writes item.
3. Supabase emits realtime change to all subscribed family devices.
4. Clients upsert/delete by item id immediately.
5. Activity log event is appended for admin timeline.
6. If write fails, optimistic UI reverts and user sees localized error.

## Security and Privacy
- Enforce family_id scoping in every backend route and realtime subscription.
- Enforce role and permission checks server-side (do not trust client toggles).
- Message and activity access limited to family members only.
- Avoid logging sensitive personal data in plain text.
- Rate-limit chat send/edit endpoints and invite operations.

## Offline and Resilience
- Keep existing offline queue for shopping list writes.
- For chat: queue outbound messages with retry and clear failed state UI.
- On reconnect: replay pending actions, then sync missing events by cursor.
- Use idempotency keys for retry-safe creates.

## Analytics and Observability
- Events:
	- collaboration_opened
	- member_invited
	- invite_accepted
	- role_changed
	- chat_message_sent
	- chat_message_failed
	- list_update_realtime_received
	- admin_override_action
- Operational metrics:
	- realtime_propagation_ms
	- chat_send_latency_ms
	- conflict_rate
	- invite_acceptance_rate

## Implementation Checklist

### Phase A: Contracts and Schema
- [x] Add shared collaboration DTO types in shared package.
- [x] Add SQL migration for collaboration tables and indexes.
- [x] Add RLS policies for family-scoped read/write.

### Phase B: Backend Collaboration APIs
- [x] Implement members and invites endpoints under /api/collaboration.
- [x] Implement chat CRUD and receipts endpoints.
- [x] Implement activity log endpoint with pagination.
- [x] Add role/permission middleware reuse across collaboration routes.

### Phase C: Mobile Collaboration UI
- [x] Build Family Collaboration screen (members + invites + roles).
- [x] Build in-app chat screen with realtime stream.
- [x] Add typing indicators and presence badge.
- [x] Add admin panel actions for live shopping list control.

### Phase D: Realtime and Conflict Handling
- [x] Subscribe to chat and activity streams by family_id.
- [x] Add conflict banner and stale-edit recovery UI in shopping list flows.
- [x] Add "recently updated by X" per-item attribution indicator.
- [x] Add recovery flows for rejected writes beyond stale-edit conflicts.

## Next Implementation Steps (Recommended Order)
1. Expand admin collaboration panel with bulk/edit actions (not only quick mark/delete).
2. Expand mobile tests for optimistic failure handling and retry behavior.
3. Add integration coverage for collaboration activity and invite lifecycle edge cases.
4. Add item-level timeline UI fed from collaboration activity events.
5. Deploy verified `.well-known` association files on the production invite domain and replace placeholder store identifiers.

### Phase E: QA and Hardening
- [x] Backend tests: role guard, family scoping, moderation permissions (chat moderation scope covered).
- [ ] Mobile tests: realtime updates, optimistic rollback, chat retries (realtime chat coverage added; rollback/retry pending).
- [ ] End-to-end test with 2-3 devices in same family.
- [ ] Load test chat + list concurrent updates.

## Test Matrix
- Admin edits list while member is viewing.
- Two editors update same item at near-same time.
- Viewer attempts forbidden write action.
- Invite sent, revoked, then accepted (should fail after revoke).
- Chat send/edit/delete under poor network.
- Member removed from family while app is open.
- Realtime reconnect after offline period.

## Acceptance Criteria
- Admin can see and modify shopping list in realtime across all active family devices.
- Invite recipients do not manually enter tokens; invite review and accept/decline happen inside the app after link open and sign-in.
- Family chat supports reliable send and receive with role-safe moderation.
- Forbidden actions are blocked server-side and surfaced with clear localized errors.
- Activity timeline shows who changed what and when for key collaboration actions.
- No cross-family data leakage in chat, list updates, or activity feeds.

## Open Questions
- Should viewer role be allowed to react to chat messages (without editing list)?
- Do we need per-item chat threads in phase 1 or only one family room?
- Should message retention be time-limited or unlimited for premium plans?

