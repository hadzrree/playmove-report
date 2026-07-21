// Supabase client setup for GitHub Pages.
// 1. Create a Supabase project.
// 2. Replace the two placeholder values below with your project's URL and anon public key.
// 3. In Supabase Auth settings, add your GitHub Pages URL to the allowed redirect URLs.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Public browser-safe Supabase project URL.
export const SUPABASE_URL = "https://dozwsicxriyxtjvtntfy.supabase.co";

// Public browser-safe anon key. Do not use a service-role key in GitHub Pages.
export const SUPABASE_ANON_KEY = "sb_publishable_Uvn2DEJyqZZ8Cc79sLkyIQ_8kbCFI4p"

// Shared client used by login, signup, logout, and protected-page checks.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist the authenticated user in localStorage so refreshes keep the session.
    persistSession: true,
    // Restore saved sessions automatically when each page loads.
    autoRefreshToken: true,
    // Detect confirmation and recovery links when Supabase redirects back to the site.
    detectSessionInUrl: true,
  },
});

// Helper used by auth pages to detect whether real Supabase credentials were configured.
export function hasSupabaseConfig() {
  return !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
}
