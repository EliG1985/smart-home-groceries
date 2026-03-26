import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your actual Supabase project URL and anon key
const supabaseUrl = 'https://qryilczpdjzhzrcpptkx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeWlsY3pwZGp6aHpyY3BwdGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODg3MjksImV4cCI6MjA4OTk2NDcyOX0.f6Sq26YQRqa8RtVCBYKJJe5f1ogw3GTPr0yPYRdrd_M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
