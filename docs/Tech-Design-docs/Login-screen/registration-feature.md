# Registration Feature: Technical Design

## Overview
Implement a user registration flow for the Smart Home Groceries app, supporting both Supabase (online) and local (offline) account creation. The registration process should securely store credentials, handle validation, and provide a seamless user experience regardless of connectivity.

## Goals
- Allow new users to register via Supabase when online.
- Allow local registration (with secure credential storage) when offline.
- Validate email, password, and required fields.
- Sync local accounts to Supabase when connectivity is restored (optional, for future).
- Provide clear UI feedback for success/failure and connectivity state.

## Flow Diagram
```
User opens Registration Screen
    |
    v
User enters email & password
    |
    v
[Is Online?] -- Yes --> Supabase Registration
    |                        |
    |                        v
    |                [Success?] -- Yes --> Store session, navigate to Main
    |                        |
    |                        v
    |                  [Error] --> Show error message
    |
    No
    |
    v
Local Registration (hash & store credentials)
    |
    v
Show offline success message, navigate to Main (limited features)
```

## Data Handling
- **Supabase:** Use `supabase.auth.signUp({ email, password })`.
- **Local:** Hash email+password with SHA256, store in AsyncStorage as `{ email, hash }`.
- **Validation:**
  - Email: must be valid format.
  - Password: min 8 chars, at least one number/letter.

## UI/UX
- Registration screen with email, password, confirm password fields.
- Show loading indicator during registration.
- Show error/success messages.
- Indicate offline/online mode.

## Security
- Never store plain passwords.
- Use strong hashing (SHA256 via expo-crypto).
- Do not expose sensitive errors to the user.

## Edge Cases
- Email already registered (Supabase/local).
- Passwords do not match.
- No connectivity during registration.
- Device storage errors.

## Future Enhancements
- Sync local accounts to Supabase when online.
- Email verification.
- Password reset.

---

**Author:** GitHub Copilot
**Date:** 2026-03-25
