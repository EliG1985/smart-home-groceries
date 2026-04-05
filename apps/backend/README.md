# SmartHome Groceries — Backend API

Node.js + Express REST API server for SmartHome Groceries, written in TypeScript.

---

## Getting Started

```bash
npm install
npm run dev      # hot-reload via ts-node-dev
# or
npm run build    # compile TypeScript to dist/
npm start        # run compiled output
```

Server runs on `http://localhost:4000` by default.

Health check: `GET /health` → `{ "status": "ok" }`

---

## Environment Variables

Create `apps/backend/.env` (not committed):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PORT=4000
INVITE_PUBLIC_BASE_URL=https://links.smarthomegroceries.app/invite
APP_SCHEME=smarthomegroceries
ANDROID_APP_PACKAGE=com.anonymous.smarthomegroceriesmobile
ANDROID_APP_SHA256_CERT_FINGERPRINTS=<sha256-fingerprint-1>,<sha256-fingerprint-2>
IOS_ASSOCIATED_APP_IDS=<team-id>.com.anonymous.smarthomegroceriesmobile
ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.anonymous.smarthomegroceriesmobile
IOS_STORE_URL=https://apps.apple.com/app/id<app-store-id>
SMTP_URL=smtps://<username>:<password>@<host>:465
# or SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
SMTP_FROM=SmartHome Groceries <noreply@example.com>
SMTP_REPLY_TO=support@example.com
```

---

## Project Structure

```
apps/backend/
├── src/
│   ├── server.ts        # Express app entry point
│   └── routes/
│       ├── inventory.ts    # Inventory + shopping-list contract endpoints
│       ├── shoppingList.ts # Compatibility alias route
│       ├── chat.ts         # Chat endpoints (planned)
│       ├── reports.ts      # Reports endpoints (planned)
│       └── store.ts        # Store endpoints (planned)
│   └── contracts/
│       └── inventory.ts    # Contract request/response DTO types
├── package.json
└── tsconfig.json
```

---

## API Endpoints

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/health` | ✅ Live | Health check |
| GET | `/api/inventory` | ✅ Live | List family-scoped inventory items (supports `?status=In_List|At_Home`) |
| POST | `/api/inventory` | ✅ Live | Create inventory/shopping-list item |
| PATCH | `/api/inventory/:id` | ✅ Live | Update item fields |
| PATCH | `/api/inventory/:id/status` | ✅ Live | Move item between list and pantry |
| DELETE | `/api/inventory/:id` | ✅ Live | Delete a single item |
| POST | `/api/inventory/batch/buy` | ✅ Live | Mark selected items as bought (`At_Home`) |
| POST | `/api/inventory/batch/delete` | ✅ Live | Delete selected items |
| * | `/api/shopping-list/*` | ✅ Live | Alias to `/api/inventory/*` for compatibility |
| GET | `/api/collaboration/participants` | ✅ Live | List family members |
| GET | `/api/collaboration/invites?status=pending` | ✅ Live | List invites by status (admin) |
| POST | `/api/collaboration/invite` | ✅ Live | Create or refresh pending invite (admin) |
| POST | `/api/collaboration/invite/link` | ✅ Live | Create no-email invite link for SMS/WhatsApp sharing (admin) |
| GET | `/api/collaboration/invites/:token` | ✅ Live | Resolve invite token details |
| POST | `/api/collaboration/invites/accept` | ✅ Live | Accept invite token and join family |
| POST | `/api/collaboration/invites/:inviteId/resend` | ✅ Live | Regenerate token and extend expiry (admin) |
| POST | `/api/collaboration/invites/:inviteId/revoke` | ✅ Live | Revoke pending invite (admin) |
| DELETE | `/api/collaboration/participants/:userId` | ✅ Live | Remove family member (admin) |
| GET | `/invite/:token` | ✅ Live | HTTPS invite landing route with app/store fallback |
| GET | `/.well-known/assetlinks.json` | ✅ Live | Android App Links association metadata |
| GET | `/.well-known/apple-app-site-association` | ✅ Live | iOS Universal Links association metadata |
| * | `/chat/*` | 🔲 Planned | Family chat |
| * | `/reports/*` | 🔲 Planned | Spending reports |
| * | `/store/*` | 🔲 Planned | In-app store |

### Guard Headers (temporary scaffold)

Until JWT middleware is wired, write guards use headers:
- `x-family-id`
- `x-user-id`
- `x-user-role` (`admin | editor | viewer`)
- `x-subscription-tier` (`Free | Premium`)
- `x-family-members-count`
- `x-perm-shopping-create`
- `x-perm-shopping-edit`
- `x-perm-shopping-delete`
- `x-perm-shopping-mark-done`
- `x-perm-shopping-view-progress`

Write failures:
- `403 FORBIDDEN_ROLE` for `viewer`
- `403 FORBIDDEN_PERMISSION` for denied action by custom permissions
- `402 PREMIUM_REQUIRED` when shared family writes require Premium

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| express | ^4.18.2 | HTTP server framework |
| @supabase/supabase-js | ^2.39.7 | Supabase client |
| nodemailer | ^7 | SMTP invite email delivery |
| typescript | ^5.0.0 | Type safety |
| ts-node-dev | ^2.0.0 | Hot-reload dev server |

---

## Invite Delivery Notes

- Admin email invites now send a real SMTP email that contains an HTTPS invite link.
- The HTTPS invite route attempts to open the app and falls back to the relevant store when the app is not installed.
- For production App Links / Universal Links to work directly, the configured `INVITE_PUBLIC_BASE_URL` host must serve the `.well-known` endpoints from this backend and your app signing identifiers must match the values in the environment variables.