# Technical Design: Dual Authentication Logic (Supabase + Local Fallback)

## Overview
This document describes the design for a dual authentication system in the Smart Home Groceries app. The system will always attempt to authenticate users online via Supabase, but will transparently fall back to local (offline) authentication if the backend is unreachable. The user never chooses the mode; the app handles all logic automatically.

## Goals
- Provide seamless login and session persistence for both online and offline scenarios.
- Default to Supabase authentication for all users.
- Allow access to basic features (shopping list) in offline mode if local credentials are valid.
- Hide the distinction between online/offline from the user.
- Securely store credentials/tokens locally for fallback.

## Flow Diagram

1. **App Launch / Login Attempt**
    - Try to authenticate with Supabase using provided credentials.
    - If Supabase login succeeds:
        - Store session/token and credentials in AsyncStorage.
        - Fetch user profile and subscription status.
        - Grant access to all features based on subscription.
    - If Supabase login fails due to network error:
        - Check AsyncStorage for locally saved credentials.
        - If local credentials match:
            - Grant access to shopping list only (offline mode).
        - If no match:
            - Show error: "Unable to login. Please check your connection."
    - If Supabase login fails due to invalid credentials:
        - Show error: "Invalid email or password."

2. **Session Persistence**
    - On app start, check for a valid Supabase session.
    - If session exists, use it.
    - If not, check for valid local credentials and allow offline access to shopping list.

3. **Registration**
    - Always performed online via Supabase.
    - On success, store credentials locally for fallback.

4. **Logout**
    - Clear Supabase session and local credentials.

## Data Storage
- **AsyncStorage**
    - Stores: email, password (hashed), and last successful login timestamp.
    - Stores: Supabase JWT/session token.
- **Supabase**
    - Stores: user credentials, profile, subscription status.

## Security Considerations
- Passwords should be hashed before storing locally.
- Use secure storage if available (e.g., Expo SecureStore) for tokens and sensitive data.
- Never store plain-text passwords.

## UI/UX
- No explicit online/offline toggle for the user.
- If offline, show a banner/toast: "You are offline. Some features are unavailable."
- If login fails due to network, but local credentials are valid, show only shopping list.
- If login fails due to invalid credentials, show error.

## Error Handling
- Distinguish between network errors and invalid credentials.
- Provide clear feedback for each scenario.

## Extensibility
- The logic can be extended to support additional fallback mechanisms or secure storage solutions.

---

**Author:** GitHub Copilot
**Date:** 2026-03-25
