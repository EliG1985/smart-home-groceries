# SmartHome Groceries — Mobile App

Expo React Native mobile client (SDK 50, React Native 0.73.6).

---

## Getting Started

```bash
npm install
npx expo start --offline   # no internet required
# or
npx expo start             # requires access to api.expo.dev
```

Press `a` for Android emulator, `w` for web, or scan QR with Expo Go (SDK 50).

---

## Environment Variables

Create `apps/mobile/.env` (not committed):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## Project Structure

```
apps/mobile/
├── App.tsx                  # Root component — navigation setup, session restore
├── navigation.tsx           # (reserved for additional nav config)
├── app.json                 # Expo config — SDK 50, app name, Android package
├── modules/
│   ├── LoginScreen.tsx      # Email/password login + Supabase auth
│   ├── RegistrationScreen.tsx  # Registration form with inline validation
│   ├── LanguageSelector.tsx # i18next language switcher (EN/HE)
│   ├── inventory.tsx        # Inventory module (placeholder)
│   ├── shoppingList.tsx     # Shopping list module (placeholder)
│   ├── chat.tsx             # Chat module (placeholder)
│   ├── reports.tsx          # Reports module (placeholder)
│   └── store.tsx            # In-app store module (placeholder)
├── ui/
│   ├── AppButton.tsx        # Shared styled button component
│   └── theme.ts             # Colors, spacing, font sizes, border radii
├── utils/
│   ├── supabaseClient.ts    # Supabase JS client (singleton)
│   └── i18n.ts              # i18next setup with locale detection
├── locales/
│   ├── en.json              # English strings
│   └── he.json              # Hebrew strings
└── assets/                  # App icons and splash images
```

---

## Navigation

- **Root stack**: `Login` → `Main` (auto-routes based on restored session)
- **Main (Drawer)**: Inventory, ShoppingList, Chat, Reports, Store
- Session is restored from AsyncStorage on app launch (Supabase session first, then local hash fallback)

---

## Authentication

- **Primary**: Supabase email/password (`supabase.auth.signUp` / `supabase.auth.signInWithPassword`)
- **Fallback**: Local credential hash using `expo-crypto` SHA-256 stored in AsyncStorage
- Session persisted in AsyncStorage under key `supabaseSession`

---

## Registration Form

| Field | Required | Notes |
|-------|----------|-------|
| Full Name | Yes | |
| Email | Yes | Format-validated |
| Password | Yes | Min 8 characters |
| Confirm Password | Yes | Must match Password |
| Birthday | Yes | Date picker (native) / date input (web) |
| Phone Number | No | Format-validated only if provided |
| City | No | |

Inline validation: mandatory empty fields are highlighted red with an error message below each field on submit attempt.

User profile data (`full_name`, `phone`, `city`, `birthday`) is stored in `auth.users.raw_user_meta_data` via Supabase.

---

## Localisation

- Powered by `i18next` + `react-i18next`
- Supported languages: **English** (`en`), **Hebrew** (`he`)
- Language selector component available: `modules/LanguageSelector.tsx`

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| expo | ~50.0.0 | SDK and toolchain |
| react-native | 0.73.6 | Mobile runtime |
| @supabase/supabase-js | ^2.39.7 | Auth + database |
| @react-navigation/native | ^6.1.17 | Navigation |
| @react-navigation/drawer | ^6.7.2 | Drawer navigator |
| @react-navigation/native-stack | ^6.9.26 | Stack navigator |
| react-native-reanimated | ~3.6.2 | Animations (SDK 50 pinned) |
| react-native-screens | ~3.29.0 | Native screen containers |
| react-native-gesture-handler | ~2.14.0 | Gesture support |
| react-native-safe-area-context | 4.8.2 | Safe area insets |
| react-native-web | ^0.19.13 | Web support |
| i18next + react-i18next | latest | Localisation |
| expo-crypto | ~12.8.1 | Local auth hashing |