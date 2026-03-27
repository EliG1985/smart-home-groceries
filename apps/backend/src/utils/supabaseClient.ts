import { createClient } from '@supabase/supabase-js';

// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
// The service role key bypasses Row-Level Security, which is required for
// server-side writes. The anon key is used as a dev fallback only.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://qryilczpdjzhzrcpptkx.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  // dev-only fallback — replace with SUPABASE_SERVICE_ROLE_KEY in production
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeWlsY3pwZGp6aHpyY3BwdGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODg3MjksImV4cCI6MjA4OTk2NDcyOX0.f6Sq26YQRqa8RtVCBYKJJe5f1ogw3GTPr0yPYRdrd_M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
