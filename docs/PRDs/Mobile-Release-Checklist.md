# Mobile Release Checklist (iOS + Android)

## 1) Environment

- Set Expo public env variables before running or building mobile:
  - `EXPO_PUBLIC_API_BASE_URL`
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Ensure backend is reachable from real devices (not only localhost).

## 2) App Identity

- Confirm bundle identifiers in `apps/mobile/app.json`:
  - iOS: `com.smarthome.groceries`
  - Android: `com.smarthome.groceries`
- Confirm app name/slug/version are production-ready.

## 3) Build Tooling

- Install EAS CLI:
  - `npm i -g eas-cli`
- Login to Expo account:
  - `eas login`

## 4) Native Builds

From `apps/mobile`:

- iOS production build:
  - `npx eas build --platform ios --profile production`
- Android production build:
  - `npx eas build --platform android --profile production`

## 5) Store Assets

Prepare before submission:

✅ App icon and splash images (implemented)
⚠️ Store screenshots (multiple device sizes) (planned)
⚠️ Privacy policy URL (planned)
⚠️ Support email / website (planned)
⚠️ App description + keywords (planned)

## 6) Permissions & Privacy

✅ Validate location permission text in `app.json` (`NSLocationWhenInUseUsageDescription`) (implemented).
✅ Validate notifications permission text in `app.json` (`NSUserNotificationsUsageDescription`) (implemented).
✅ Ensure privacy questionnaire answers match actual data usage (implemented).
✅ Ensure in-app privacy acceptance flow is accessible in Settings (implemented).

## 6.1) Push Notifications

✅ Install and configure `expo-notifications` plugin (implemented).
✅ Verify push permission request flow on a physical device (implemented).
✅ Confirm Expo push token is generated in app settings (implemented).
⚠️ For production, configure EAS project and backend push dispatch flow (planned).

## 7) Pre-Submit QA

- Login/logout flow works with Supabase.
- Session restores after app restart.
- Shopping list CRUD works for single-user free mode.
- Monthly package lock/unlock behavior works.
- Nearby supermarkets endpoint works on device network.
- No console crashes in release build.

## 8) Submission

- iOS submit:
  - `npx eas submit --platform ios --profile production`
- Android submit:
  - `npx eas submit --platform android --profile production`

## 9) Post-Release

- Monitor crashes and ANRs.
- Verify auth/session reliability.
- Verify backend/API latency on mobile networks.
