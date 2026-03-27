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
| * | `/chat/*` | 🔲 Planned | Family chat |
| * | `/reports/*` | 🔲 Planned | Spending reports |
| * | `/store/*` | 🔲 Planned | In-app store |

### Guard Headers (temporary scaffold)

Until JWT middleware is wired, write guards use headers:
- `x-family-id`
- `x-user-id`
- `x-user-role` (`owner | editor | viewer`)
- `x-subscription-tier` (`Free | Premium`)
- `x-family-members-count`

Write failures:
- `403 FORBIDDEN_ROLE` for `viewer`
- `402 PREMIUM_REQUIRED` when shared family writes require Premium

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| express | ^4.18.2 | HTTP server framework |
| @supabase/supabase-js | ^2.39.7 | Supabase client |
| typescript | ^5.0.0 | Type safety |
| ts-node-dev | ^2.0.0 | Hot-reload dev server |