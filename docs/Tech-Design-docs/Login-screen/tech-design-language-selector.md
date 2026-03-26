# Technical Design: Language Selector for Login/Register UI

## Overview
The Language Selector enables users to choose their preferred language during the login and registration process. This feature enhances accessibility and user experience for a diverse, multilingual user base.

## Goals
- Allow users to select their language before authentication
- Persist language preference across sessions
- Integrate with app-wide localization (i18n)
- Support dynamic language switching in the login/register UI

## Architecture
- **Frontend:**
  - React Native component (LanguageSelector)
  - Integrated into LoginScreen and RegisterScreen
- **Localization:**
  - Uses i18n library (e.g., i18next, react-i18next)
  - Language files stored locally (JSON)
- **Persistence:**
  - Store selected language in AsyncStorage or SecureStore
  - Optionally sync with user profile in Supabase after login

## UI/UX
- Dropdown or modal for language selection
- Display language names in their native script
- Language selector visible on login/register screens
- Immediate UI update on language change

## Component Structure
- **State:**
  - `selectedLanguage`: string
  - `availableLanguages`: array
- **Handlers:**
  - `onLanguageChange`: Updates i18n language and persists selection

## Security Considerations
- No sensitive data handled
- Ensure language preference does not leak authentication data

## Extensibility
- Add more languages by updating language files
- Integrate with registration/profile for persistent user preference

## Dependencies
- `react-i18next` or similar i18n library
- `@react-native-async-storage/async-storage` or `expo-secure-store`

## Example Code Reference
- To be implemented: `apps/mobile/modules/LanguageSelector.tsx`

## Future Enhancements
- Sync language preference with Supabase user profile
- Add right-to-left (RTL) language support
- Detect device language for initial selection

---

**Author:** GitHub Copilot
**Date:** 2026-03-25
