  // ============================================================                                                       
  // SUPABASE CONFIGURATION                                                                                           
  // ============================================================
                                                                                                                        
  const SUPABASE_URL = 'https://shtkqzzswxrmraaeopkn.supabase.co';
  const SUPABASE_ANON_KEY =                                                                                             
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNodGtxenpzd3hybXJhYWVvcGtuIiwicm9sZSI6ImFub24i
  LCJpYXQiOjE3NzYwODgzMjksImV4cCI6MjA5MTY2NDMyOX0.CpQcNfgtiF9RJVG-vvzG5Ci5V_RIOm9xGcBndM7FIFY';
                                                                                                                        
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);     
