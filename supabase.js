// Supabase client setup for GitHub Pages.
// Sign-in happens through PLAYMOVE (single sign-on): this page never asks for a password.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// true  = open the report generator without any sign-in (pilot only).
// false = staff must be signed in through PLAYMOVE.
export const PILOT_MODE = false;

// Public browser-safe Supabase project URL.
export const SUPABASE_URL = "https://dozwsicxriyxtjvtntfy.supabase.co";

// Public browser-safe anon key. Do not use a service-role key in GitHub Pages.
export const SUPABASE_ANON_KEY = "sb_publishable_Uvn2DEJyqZZ8Cc79sLkyIQ_8kbCFI4p"

// Where PLAYMOVE lives. On a developer's own machine it is the local copy.
const LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
export const PLAYMOVE_URL = LOCAL ? "http://localhost:5173" : "https://playmoveos.netlify.app";

// The name this app is registered under in PLAYMOVE single sign-on.
export const SSO_CLIENT_ID = "screening";

// Shared client used by sign-in, logout, and protected-page checks.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist the authenticated user in localStorage so refreshes keep the session.
    persistSession: true,
    // Restore saved sessions automatically when each page loads.
    autoRefreshToken: true,
    // PLAYMOVE returns its own one-time code; Supabase must not try to read the address bar.
    detectSessionInUrl: false,
    storageKey: "playmove-report-auth",
  },
});

// Helper used by auth pages to detect whether real Supabase credentials were configured.
export function hasSupabaseConfig() {
  return !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
}
