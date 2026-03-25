# SmartHome Groceries Monorepo

A professional, scalable monorepo for SmartHome Groceries, supporting both mobile (Expo React Native) and backend (Node.js/Express) apps, with shared types and utilities.

## Structure
- `apps/mobile`: Expo React Native app
- `apps/backend`: Node.js/Express API server
- `shared/`: Shared types and utilities
- `docs/`: Product, technical, and release documentation

## Quick Start
1. Install dependencies in each app folder
2. Configure `.env` files for Supabase and API endpoints
3. Start backend: `cd apps/backend && npm run dev`
4. Start mobile: `cd apps/mobile && npx expo start`

## Key Features
- Modular, scalable architecture
- Supabase integration (auth, storage, realtime)
- EAS CLI for mobile builds
- TypeScript everywhere

---
See `docs/` for PRDs, checklists, and feature documentation.