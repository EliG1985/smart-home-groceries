# SmartHome Groceries — Current Product PRD (As Implemented)

Date: 2026-03-05  
Status: Current-state PRD derived from implementation in frontend, backend, and Supabase schema.

## 0) Recent Implementation Updates (2026-03-27)
✅ Clean-room supermarket pricing backend slice added:
- `GET /api/store/chains`
- `POST /api/store/prices/by-barcode`
- Snapshot-backed source model (`clean_room_snapshot`) to keep API stable before ingestion phase.

✅ Shopping List barcode add flow now includes market-price assist:
- Barcode lookup still drives product/category suggestions.
- Mobile now performs non-blocking supermarket price lookup after barcode lookup.
- Add form displays best-price card (chain + price + optional promo).
- Price field may be prefilled from best quote when still at default value.
- EN/HE localization keys added for the best-price UI copy.

## 1) Product Vision
SmartHome Groceries is a family-centric grocery and pantry management app focused on:
✅ Shared shopping list and home inventory workflows (implemented)
✅ Collaboration between family members (roles, invitations, chat) (implemented)
✅ Smart assistance (barcode lookup, price insights, AI-like category/suggestion logic) (implemented)
✅ Mobile-first UX with localized Hebrew/English support (implemented)

## 2) Primary Personas
✅ Family Owner: manages household, participants, roles, and premium collaboration setup (implemented)
✅ Family Editor: contributes items, messages, and substitute decisions (implemented)
✅ Family Viewer: read-oriented member (blocked from write actions in guarded backend mode) (implemented)
✅ Price-conscious shopper: compares selected supermarket basket estimates (implemented)

## 3) Product Goals (Current)
✅ Keep list and pantry synchronized in real-time for family members (implemented)
✅ Minimize input friction (history suggestions, barcode scan, fast add/edit) (implemented)
✅ Enable family coordination with media-rich chat (implemented)
✅ Surface spending analytics and supermarket comparison insights (implemented)
✅ Provide a monetization-ready UX foundation via in-app store (implemented)

## 4) Scope Snapshot (Current Build)
### Included and Working
✅ Auth shell (local account fallback + Supabase-backed API mode) (implemented)
✅ Shopping list CRUD and batch actions (implemented)
✅ Pantry view with expiry signals (implemented)
✅ Barcode scanner + Open Food Facts lookup (implemented)
✅ Reports with category chart and monthly totals (implemented)
✅ Settings with theme, geolocation supermarket suggestions, AI insights (implemented)
✅ Family participants management and invitation inbox (implemented)
✅ Family chat with:
  - text messages (implemented)
  - image/file attachments (implemented)
  - voice recording and audio attachments (implemented)
  - substitute learning/suggestions (implemented)
  - signed URL resolution for private storage (implemented)
✅ App-wide localization (EN/HE) and RTL handling via language provider (implemented)
✅ Unified background skins across screens (implemented)
✅ In-app store screen with coin packs and unlockable items (demo/local-only wallet) (implemented)

### Not Fully Productized Yet
- Real payment processing and secure wallet ledger (store is local demo)
- Server-enforced ownership for store unlocks
- Full production subscription billing lifecycle
- Native mobile IAP integration (Apple/Google billing)

## 5) Feature PRD by Module

## 5.1 Authentication & Session
### Problem
Users need quick sign-in with family context.

### Current Behavior
✅ Login/register UI with language selector (implemented)
✅ Local mode stores accounts in browser localStorage (implemented)
✅ Backend mode relies on Supabase JWT and users_profile family linkage (implemented)
✅ Session/auth failures trigger logout + session-expired status (implemented)

### Requirements Implemented
✅ Required field validation on auth forms (implemented)
✅ Register supports creating/joining family ID (implemented)
✅ User context in app state includes: id, email, familyId, role, subscriptionTier (implemented)
✅ Password reset flow (implemented: Supabase email reset + local reset)

### Known Gaps
✅ No password reset flow (implemented, uses Supabase email services)
⚠️ No MFA (not implemented, requires paid/auth provider)
⚠️ Local auth is demo-grade only (no cost, suitable for development)

## 5.2 Shopping List
### Problem
Families need a quick shared list with category grouping and bulk actions.

### Current Behavior
✅ Items grouped by category (implemented)
✅ Per-item actions: details toggle, edit, mark purchased, delete (implemented)
✅ Bulk actions when multiple items selected: delete all selected, buy all selected (implemented)
✅ Total list price shown (implemented)

### Acceptance Criteria (Current)
✅ Items render grouped by category (implemented)
✅ Selecting all toggles all list items (implemented)
✅ Mark purchased moves status to At_Home (implemented)
✅ Empty-state text appears when no list items (implemented)

## 5.3 Pantry (At Home)
### Problem
Need visibility of in-home stock and expiry urgency.

### Current Behavior
✅ Expiry tone system: expired, warning (<=48h), ok (implemented)
✅ Per-item actions: details, edit, move back to list (implemented)

### Acceptance Criteria (Current)
✅ Tone changes based on expiry date logic (implemented)
✅ Move-to-list updates item status immediately (implemented)

## 5.4 Add/Edit Item Experience
### Problem
Manual item entry is slow and repetitive.

### Current Behavior
✅ Add modal supports name/category/barcode/qty/price/expiry/status (implemented)
✅ Scanner path can auto-create an item after barcode detection (implemented)
✅ Product name lookup uses Open Food Facts (implemented)
✅ Price estimation uses backend product-price endpoint if available; otherwise synthetic local baseline (implemented)
✅ HistoryInput stores recently used values per field key (implemented)

### Acceptance Criteria (Current)
✅ Add modal validates minimum required fields (implemented)
✅ Edit modal pre-fills current values and saves updates (implemented)
✅ Scan-and-add path closes modal and inserts item (implemented)

## 5.5 Reports & Analytics
### Problem
Users need basic spending visibility.

### Current Behavior
✅ Pie chart of shopping list spend by category (implemented)
✅ Current month vs previous month totals (implemented)
✅ Chart rendering hardened to avoid invalid width/height mounts (implemented)

### Acceptance Criteria (Current)
✅ Chart does not render until measured width > 0 (implemented)
✅ Minimum chart height maintained at 260 (implemented)

## 5.6 Settings + AI Insights
### Problem
Users want market comparison and personalization.

### Current Behavior
✅ Theme selection (light/dark) via HTML class toggle (implemented)
✅ Preferred supermarket selection with optional geolocation-assisted nearest branches (implemented)
✅ AI insights panel: backend mode pulls supermarket insight payload from API, local mode computes deterministic baseline insights client-side (implemented)
✅ Optional AI category apply action in backend mode (implemented)

### Acceptance Criteria (Current)
✅ Geolocation fallback messages handled (implemented)
✅ Insights panel handles loading/error/data states (implemented)
✅ Category update action refreshes insight dataset (implemented)

## 5.7 Family Collaboration (Participants)
### Problem
Families need controlled shared access and invitations.

### Current Behavior
✅ Member list with role display (implemented)
✅ Owner can update other members’ roles (implemented)
✅ Invite by email flow (implemented)
✅ Pending family invitations list (implemented)
✅ Personal invitation inbox with accept/decline (implemented)
✅ Realtime unread invitation badge in navigation (implemented)

### Access Controls
✅ Viewer blocked from participant management write actions (implemented)
✅ Role changes restricted to owner (implemented)
✅ Premium gate when shared collaboration expands beyond one member (implemented)

### Acceptance Criteria (Current)
✅ Invite creates pending invitation (implemented)
✅ Accepted invitation updates family membership (implemented)
✅ Invitation badge updates via realtime table events (implemented)

## 5.8 Family Chat (WhatsApp-like)
### Problem
Families need low-friction coordination around items and substitutes.

### Current Behavior
✅ Dedicated Chat tab/screen (implemented)
✅ Messaging supports: text, image/file attachments, voice note recording (MediaRecorder), playback for audio attachments (implemented)
✅ Attachment upload to private Supabase bucket (implemented)
✅ Stable storage path in DB + signed URL fetch endpoint (implemented)
✅ Chat substitute learning panel: save substitute decision, query learned suggestions (implemented)
✅ Realtime new-message updates (implemented)
✅ Toast feedback for send/fail/save actions (implemented)

### Acceptance Criteria (Current)
✅ Message can be sent with text and/or attachments (implemented)
✅ Voice recording can start/stop and produces audio file attachment (implemented)
✅ Attachments render correctly by MIME family (image/audio/link) (implemented)
✅ Local mode stores messages and substitutes in browser storage (implemented)

## 5.9 In-App Store + Background Skins
### Problem
Need monetization UX and customization primitives.

### Current Behavior
✅ New Store tab in bottom navigation (implemented)
✅ Coin packages and unlockable catalog (skins + feature unlock cards) (implemented, demo/local only)
✅ Wallet and unlocked items persisted locally per user (implemented, demo/local only)
✅ Global background skin applies across app screens (including auth) (implemented)

### Important Status
⚠️ This is demo-mode monetization UX only (no-cost, local wallet/unlocks; no real payment provider or backend ledger enforcement)

### Acceptance Criteria (Current)
✅ Buying coin pack increases local coin balance (implemented, demo/local only)
✅ Unlocking deducts coins and records unlock (implemented, demo/local only)
✅ Unlocked skin can be applied globally (implemented)

## 6) Navigation & UX Model
✅ Mobile-first bottom nav tabs: List, Home, Chat, Store, Reports, Participants (implemented)
✅ Settings accessed from sticky header action (implemented)
✅ Desktop behavior: List/Inventory tabs show split panels, other tabs show dedicated panel view (implemented)

## 7) Localization & Accessibility
✅ Languages: English + Hebrew (implemented)
✅ RTL support enabled when Hebrew selected (implemented)
✅ Translation dictionary has broad coverage for core features (implemented)
⚠️ Some hardcoded backend error strings may still surface untranslated (partial)

## 8) Security, Roles, and Plan Gates
✅ API endpoints protected by Bearer JWT middleware (implemented)
✅ family_id scoping enforced in backend and RLS policies (implemented)
✅ Inventory mutation gates: viewer forbidden, shared families require Premium tier (implemented)
✅ Collaboration write gates enforce role and plan constraints (implemented)

## 9) Data & Realtime Summary
✅ Core entities: families, users_profile, inventory, family_invitations, chat_messages, chat_message_attachments, product_substitutes, family_subscriptions (implemented)
✅ Realtime currently used for: inventory table updates, invitation updates, chat message inserts (implemented)

## 10) Product Health — Current Status
### Strengths
✅ Broad feature coverage already in code (implemented)
✅ Real-time collaboration foundations are solid (implemented)
✅ Clear separation of frontend/backend/supabase layers (implemented)
✅ Local fallback paths make development resilient (implemented)

### Risks / Debt
- Store monetization is local simulation (client-trust risk).
- README has stale endpoint mention for removed auto-invite route.
- Some UI logic remains tightly coupled in App-level tab orchestration.

## 11) Recommended Next Milestones
1. Productionize in-app purchases (backend wallet, transactions, webhook verification).  
2. Add server-driven feature flags/unlock checks for store items.  
3. Introduce e2e test coverage for collaboration + chat media flows.  
4. ✅ Add password reset/account recovery and stricter auth UX.  
5. Expand observability and error telemetry for realtime/payload failures.

## 12) Definition of Done (Current PRD Coverage)
This document reflects implemented behavior and known gaps as of the current codebase state. It is suitable for product review, sprint planning, and gap-analysis toward production readiness.

## 13) Implementation Verification Checklist (Audit: 2026-03-07)

Legend: ✅ Implemented · ⚠️ Partial / Demo-grade · ❌ Not implemented

### 13.1 Core Product Modules
- ✅ Auth shell with local fallback + backend token mode
- ✅ Shopping list CRUD, grouping, per-item actions, and bulk actions
- ✅ Pantry expiry tone + move-back-to-list flow
- ✅ Add/Edit modal with validation, barcode scan, Open Food Facts lookup, price estimation path, and HistoryInput
- ✅ Reports pie chart + monthly comparisons + guarded chart mount sizing
- ✅ Settings theme toggle, supermarket preference, geolocation nearby flow, and AI insights panel
- ✅ Participants management, invitations, inbox accept/decline, role updates, and unread realtime badge flow
- ✅ Family chat text + image/file attachments + voice recording + substitute learning/suggestions + signed URL resolution
- ✅ EN/HE localization with RTL behavior
- ✅ Store tab, coin packs, unlock catalog, and global background skin application

### 13.2 Security / Data / Realtime
- ✅ Bearer JWT middleware and auth context binding on backend routes
- ✅ family_id scoping in backend queries and Supabase RLS policies
- ✅ Inventory write gates (viewer forbidden + Premium required for shared families)
- ✅ Collaboration write gates (viewer/owner constraints + Premium checks)
- ✅ Core entities present in schema: families, users_profile, inventory, family_invitations, chat_messages, chat_message_attachments, product_substitutes, family_subscriptions
- ✅ Realtime usage present for inventory, invitations, and chat inserts

### 13.3 Confirmed Gaps (Still Pending)
- ❌ Real payment processing and provider webhook verification
- ❌ Full production subscription billing lifecycle
- ❌ Native mobile IAP (Apple/Google billing)
- ❌ MFA

### 13.4 Notes
- ⚠️ Local auth and store economy remain demo/local-storage grade in local mode by design.
- ⚠️ Some backend-originated error strings may still appear untranslated.
- ✅ Password reset/account recovery is now available in auth UI (local password reset + backend reset-link email flow), but MFA is still not implemented.
- ✅ Backend mode now uses server-authoritative store wallet balance, transaction ledger records, unlock ownership checks, and active skin persistence.
- ⚠️ Real payment provider/webhook settlement is still not implemented; coin-pack credit endpoint is demo-mode server flow.
- ✅ Backend now includes checkout session + signed webhook settlement flow (`demo-provider`) with idempotent webhook event recording.
