// ============================================================
// SUPABASE CONFIGURATION
// Replace the values below with your own project credentials.
// Find them at: https://supabase.com/dashboard → your project → Settings → API
// ============================================================

const SUPABASE_URL = 'https://shtkqzzswxrmraaeopkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNodGtxenpzd3hybXJhYWVvcGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODgzMjksImV4cCI6MjA5MTY2NDMyOX0.CpQcNfgtiF9RJVG-vvzG5Ci5V_RIOm9xGcBndM7FIFY';

// Initialize the Supabase client (available globally as `supabase`)
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
