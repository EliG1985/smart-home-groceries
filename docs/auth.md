# Authentication & Session

## Overview
Authentication supports both local (browser/device) and Supabase-backed accounts. Family context is linked to each user.

## Integrations
- Supabase Auth (JWT, users_profile)
- LocalStorage fallback for offline/local mode

## Logic
- Login/register UI with language selector
- Local mode: stores accounts in browser localStorage
- Backend mode: uses Supabase JWT and users_profile family linkage
- Session persistence and logout
