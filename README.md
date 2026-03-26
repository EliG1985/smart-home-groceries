# SmartHome Groceries — Monorepo

A monorepo for the SmartHome Groceries app, supporting a **React Native / Expo mobile client**, a **Node.js/Express REST backend**, and **shared TypeScript types**.

---

## Monorepo Structure

```
smart-home-groceries/
├── apps/
│   ├── mobile/          # Expo React Native app (SDK 50)
│   └── backend/         # Node.js + Express API server
├── shared/              # Shared TypeScript types & utilities
├── docs/                # PRDs, tech-design docs, checklists
├── supabase/            # (planned) Supabase migrations and config
├── package.json         # Root — shared build tooling (@babel/core)
├── tsconfig.base.json   # Base TypeScript config extended by each app
└── .gitignore
```

---

## Prerequisites

| Tool | Minimum Version |
|------|-----------------|
| Node.js | 20.x |
| npm | 10.x |
| Java (Android builds) | JDK 17 (Eclipse Adoptium recommended) |
| Gradle | 8.3 (used by Android project) |
| Expo Go | SDK 50 compatible |
| Android Studio | For physical/emulator Android builds |

---

## Quick Start

### 1. Install dependencies

```bash
# Root tooling
npm install

# Mobile app
cd apps/mobile && npm install

# Backend
cd apps/backend && npm install
```

### 2. Configure environment

Create `.env` files (not committed — see `.gitignore`):

**`apps/mobile/.env`**
```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**`apps/backend/.env`**
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PORT=4000
```

### 3. Start the backend

```bash
cd apps/backend
npm run dev      # ts-node-dev (hot reload)
# or
npm run build && npm start   # compiled JS
```

Backend runs on `http://localhost:4000`. Health check: `GET /health`

### 4. Start the mobile app

```bash
cd apps/mobile
npx expo start --offline    # offline (no api.expo.dev check)
# or
npx expo start              # requires internet
```

Scan the QR code with **Expo Go** (SDK 50), or press:
- `a` — open Android emulator
- `w` — open in browser (web build)

---

## Key Technologies

| Layer | Stack |
|-------|-------|
| Mobile | Expo SDK 50, React Native 0.73.6, TypeScript |
| Navigation | React Navigation v6 (Stack + Drawer) |
| Auth & Database | Supabase (supabase-js v2) |
| Localisation | i18next + react-i18next (English + Hebrew) |
| Backend | Express 4, TypeScript, ts-node-dev |
| Build tooling | Babel 7, Gradle 8.3, JDK 17 |

---

## Supabase — Data Storage

User accounts are created via `supabase.auth.signUp()`. Profile fields (`full_name`, `phone`, `city`, `birthday`) are stored in `auth.users.raw_user_meta_data`.

**Recommended**: mirror profile fields into a `public.profiles` table via a Postgres trigger (see `supabase/` folder when migrations are added).

---

## Key Features (current build)

- **Authentication** — Email/password registration + login via Supabase Auth
- **Registration form** — mandatory fields validated inline (Full Name, Email, Password, Birthday); optional fields (Phone, City)
- **Session persistence** — Supabase session stored in AsyncStorage; auto-login on reopen
- **Dual-auth fallback** — local credential hash via `expo-crypto` when Supabase is unavailable
- **Localisation** — English and Hebrew UI strings via i18next; language selector built in
- **Drawer navigation** — Inventory, Shopping List, Chat, Reports, Store screens (module placeholders)
- **Web support** — React Native Web; web date picker and conditional platform logic

---

## Docs

Product requirements, technical design, and release checklists live in `docs/`:

```
docs/PRDs/          — Feature PRDs (auth, shopping list, inventory, etc.)
docs/Tech-Design-docs/ — Technical design documents per feature
```

---

## Ignored Paths (not committed)

See `.gitignore`. Key exclusions:
- `**/node_modules/`
- `apps/mobile/android/build/`, `apps/mobile/android/.gradle/`
- `.expo/`, `.metro-cache/`
- `.env`, `.env.*`
