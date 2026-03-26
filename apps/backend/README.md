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
│       ├── inventory.ts    # Inventory endpoints (planned)
│       ├── shoppingList.ts # Shopping list endpoints (planned)
│       ├── chat.ts         # Chat endpoints (planned)
│       ├── reports.ts      # Reports endpoints (planned)
│       └── store.ts        # Store endpoints (planned)
├── package.json
└── tsconfig.json
```

---

## API Endpoints

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/health` | ✅ Live | Health check |
| * | `/inventory/*` | 🔲 Planned | Inventory management |
| * | `/shopping-list/*` | 🔲 Planned | Shopping list management |
| * | `/chat/*` | 🔲 Planned | Family chat |
| * | `/reports/*` | 🔲 Planned | Spending reports |
| * | `/store/*` | 🔲 Planned | In-app store |

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| express | ^4.18.2 | HTTP server framework |
| @supabase/supabase-js | ^2.39.7 | Supabase client |
| typescript | ^5.0.0 | Type safety |
| ts-node-dev | ^2.0.0 | Hot-reload dev server |