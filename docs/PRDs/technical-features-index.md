# Authentication & Session (auth.md)

## Overview
Authentication in SmartHome Groceries supports both local (browser/device) and Supabase-backed accounts. Family context is linked to each user.

## Integrations
- Supabase Auth (JWT, users_profile)
- LocalStorage fallback for offline/local mode

## Logic
- Login/register UI with language selector
- Local mode: stores accounts in browser localStorage
- Backend mode: uses Supabase JWT and users_profile family linkage
- Session persistence and logout

---

# Shopping List (shopping-list.md)

## Overview
Real-time, shared shopping list for all family members.

## Integrations
- Supabase Realtime (list sync)
- Backend API: /api/inventory

## Logic
- CRUD operations for items
- Batch actions (mark as bought, delete, etc.)
- History suggestions, barcode scan, fast add/edit
- List and pantry are synchronized in real-time

---

# Pantry & Inventory (pantry-inventory.md)

## Overview
Tracks home inventory, expiry, and status of products.

## Integrations
- Supabase Realtime
- Backend API: /api/inventory

## Logic
- CRUD for pantry items
- Expiry signals and notifications
- Status: In_List | At_Home
- Role/premium guards for write access

---

# Family Collaboration (collaboration.md)

## Overview
Family members can collaborate via chat, invitations, and roles.

## Integrations
- Supabase Realtime
- Backend API: /api/collaboration/*

## Logic
- Family participants management
- Invitation inbox and email invites
- Roles: Owner, Editor, Viewer
- Chat: text, image, audio, suggestions
- Substitute learning and suggestions

---

# Reports & Analytics (reports.md)

## Overview
Provides spending analytics, category charts, and supermarket comparison.

## Integrations
- Backend API: /api/reports/*
- Supabase

## Logic
- Category chart and monthly totals
- Supermarket price insights
- Product price lookup
- AI insights and geolocation suggestions

---

# In-App Store & Monetization (store-monetization.md)

## Overview
Demo/local-only store for coin packs, premium features, and skins.

## Integrations
- Local wallet (demo)
- Planned: real payment, IAP, secure wallet

## Logic
- Coin packs and unlockable items
- Premium features and analytics
- Skins, themes, and customizations
- Subscription unlocks (demo)

---

# Supermarket Tracker (supermarket-tracker.md)

## Overview
Map-based module for real-time geolocation and supermarket search.

## Integrations
- Expo Location
- react-native-maps (MapView)
- Backend API: /api/reports/supermarket-insights

## Logic
- Map with user location, radius, and markers
- Adjustable radius slider
- Loading/error states, permission handling
- Results list with distance and sorting
- Planned: geofencing, search history, directions, favorites

---

# Settings & Localization (settings-localization.md)

## Overview
App-wide settings for theme, language, and privacy.

## Integrations
- Supabase (settings sync)
- Language provider (EN/HE, RTL)

## Logic
- Theme selection
- Language and RTL handling
- Privacy acceptance flow
- Notification and location permissions

---

# Push Notifications (push-notifications.md)

## Overview
Push notifications for reminders, chat, and updates.

## Integrations
- expo-notifications
- Backend push dispatch (planned)

## Logic
- Permission request flow
- Expo push token generation
- Notification handling in app
- Planned: production push dispatch

---

# Barcode & Smart Assistance (barcode-smart-assist.md)

## Overview
Barcode scanning and AI-like suggestions for products.

## Integrations
- Open Food Facts API
- Backend API: /api/inventory

## Logic
- Barcode scanner for fast add
- Product lookup and suggestions
- AI category and price insights

---

# Family Roles & Permissions (roles-permissions.md)

## Overview
Role-based access for family members.

## Integrations
- Supabase users_profile
- Backend API: /api/collaboration/participants

## Logic
- Owner, Editor, Viewer roles
- Role gates for inventory and collaboration
- Premium gates for advanced features
