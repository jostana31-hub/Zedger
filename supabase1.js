// ============================================================
// SUPABASE CONFIGURATION
// Replace the values below with your own project credentials.
// Find them at: https://supabase.com/dashboard → your project → Settings → API
// ============================================================

const SUPABASE_URL = 'https://yzofzvlkceogcfvmcucq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6b2Z6dmxrY2VvZ2Nmdm1jdWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTQyNDUsImV4cCI6MjA5MTk3MDI0NX0.Dje6f9THG5p7epVhzNV6LtN6qPEQ0Za8jp04C4MRWrc';

// Initialize the Supabase client (available globally as `supabase`)
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
