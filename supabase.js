// ============================================================
// SUPABASE CONFIGURATION
// Replace the values below with your own project credentials.
// Find them at: https://supabase.com/dashboard → your project → Settings → API
// ============================================================

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

// Initialize the Supabase client (available globally as `supabase`)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
