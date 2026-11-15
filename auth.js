// Authentication shared by the protected report and the sign-in pages.
//
// Staff sign in ONCE, in PLAYMOVE. This app never sees a password:
//   1. login.html sends the person to PLAYMOVE with a one-off challenge.
//   2. PLAYMOVE sends them back to callback.html with a single-use code.
//   3. callback.html swaps that code (plus the secret half of the challenge,
//      which never left this browser tab) for this app's own session.
// The report then opens only for someone with an ACTIVE PlayMove staff profile.
import {
  PILOT_MODE, PLAYMOVE_URL, SSO_CLIENT_ID, SUPABASE_ANON_KEY, SUPABASE_URL, supabase, hasSupabaseConfig,
} from "./supabase.js";

// Read the page mode from the script tag so this file can be reused without build tools.
const scriptTag = [...document.scripts].find((script) => script.src.endsWith("/auth.js") || script.src.endsWith("auth.js"));
const pageMode = scriptTag?.dataset.authPage || "protected";

// Resolve sibling pages correctly on GitHub Pages project sites and local file paths.
const pageUrl = (page) => new URL(page, window.location.href).toString();
const REDIRECT_URI = new URL("callback.html", window.location.href).toString().split(/[?#]/)[0];

const PENDING_KEY = "playmove-report-sso";
const PENDING_MAX_AGE_MS = 5 * 60 * 1000;

// Show a short status message in auth pages while keeping the existing visual style.
function setAuthMessage(message, isError = false) {
  const box = document.querySelector("[data-auth-message]");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("flag", isError);
  box.classList.toggle("ok", !isError && Boolean(message));
  box.style.display = message ? "block" : "none";
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

// Leave for PLAYMOVE. Does not return.
async function startSso() {
  const verifier = randomToken();
  const state = randomToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, at: Date.now() }));

  const target = new URL("/sso/authorize", PLAYMOVE_URL);
  target.searchParams.set("client_id", SSO_CLIENT_ID);
  target.searchParams.set("redirect_uri", REDIRECT_URI);
  target.searchParams.set("code_challenge", b64url(new Uint8Array(digest)));
  target.searchParams.set("code_challenge_method", "S256");
  target.searchParams.set("state", state);
  window.location.assign(target.toString());
}

// True only for someone with an active PlayMove staff profile.
// A valid session alone is not enough: an account without a staff profile is refused.
async function hasActiveStaffProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("is_active").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_active);
}

// Hide the report until we know who is looking at it.
function hideUntilChecked() {
  document.documentElement.style.visibility = "hidden";
}
function reveal() {
  document.getElementById("authgate")?.remove();
  document.documentElement.style.visibility = "";
}

// Keep anyone who is not signed-in staff out of the report generator.
async function protectReportGenerator() {
  if (PILOT_MODE) { reveal(); return; }
  hideUntilChecked();

  if (!hasSupabaseConfig()) {
    document.body.innerHTML = `<main style="max-width:720px;margin:40px auto;padding:24px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif">
      <div style="background:#FFF4E5;border:1px solid #ED7D31;border-radius:12px;padding:18px;color:#8A4B00">
        <h1 style="margin:0 0 8px;color:#252A64;font-size:20px">Supabase setup required</h1>
        <p style="line-height:1.5">Update <code>supabase.js</code> with your Supabase project URL and anon public key before using authentication.</p>
      </div>
    </main>`;
    reveal();
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    // Straight through PLAYMOVE: if they are signed in there, they come back without typing anything.
    window.location.replace(pageUrl("login.html?sso=1"));
    return;
  }

  let allowed = false;
  try {
    allowed = await hasActiveStaffProfile(data.session.user.id);
  } catch {
    window.location.replace(pageUrl("login.html?problem=unavailable"));
    return;
  }
  if (!allowed) {
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace(pageUrl("login.html?problem=not-staff"));
    return;
  }
  reveal();
}

const PROBLEMS = {
  "not-staff": "Your account is not an active PlayMove staff profile. Contact your Administrator.",
  unavailable: "We could not check your sign-in. Check your connection and try again.",
  expired: "That sign-in link has expired or was opened in a different tab. Please try again.",
  failed: "PLAYMOVE could not sign you in to this app. Please try again.",
};

// login.html — one button, and an automatic start when sent here by the report or by PLAYMOVE.
async function initLoginPage() {
  if (PILOT_MODE) {
    window.location.replace(pageUrl("index.html"));
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const problem = PROBLEMS[params.get("problem")];
  if (problem) setAuthMessage(problem, true);

  const { data } = await supabase.auth.getSession();
  if (data.session && !problem) {
    window.location.replace(pageUrl("index.html"));
    return;
  }

  const button = document.querySelector("[data-sso-button]");
  const go = () => {
    if (button) { button.disabled = true; button.textContent = "Opening PLAYMOVE…"; }
    startSso().catch(() => {
      if (button) { button.disabled = false; button.textContent = "Sign in with PLAYMOVE →"; }
      setAuthMessage("Could not open PLAYMOVE. Please try again.", true);
    });
  };
  button?.addEventListener("click", go);

  // Only on the explicit flag, and never after a problem — so a failure cannot loop.
  if (params.get("sso") === "1" && !problem) go();
}

// callback.html — PLAYMOVE returns here with ?sso_code=…&state=…
async function completeSso() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("sso_code");
  const state = params.get("state");

  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY); // single use, whatever happens next
  let pending = null;
  try { pending = raw ? JSON.parse(raw) : null; } catch { pending = null; }

  if (!code || !state || !pending || pending.state !== state || Date.now() - pending.at > PENDING_MAX_AGE_MS) {
    window.location.replace(pageUrl("login.html?problem=expired"));
    return;
  }

  // Take the code out of the address bar before doing anything else.
  window.history.replaceState(null, "", REDIRECT_URI);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sso-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ code, client_id: SSO_CLIENT_ID, redirect_uri: REDIRECT_URI, code_verifier: pending.verifier }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token || !payload.refresh_token) throw new Error("exchange");

    const { error } = await supabase.auth.setSession({ access_token: payload.access_token, refresh_token: payload.refresh_token });
    if (error) throw error;
    window.location.replace(pageUrl("index.html"));
  } catch {
    window.location.replace(pageUrl("login.html?problem=failed"));
  }
}

// Attach logout to the report header and return the user to the sign-in page.
function initLogoutButton() {
  const logoutButton = document.getElementById("logoutbtn");
  if (!logoutButton) return;

  if (PILOT_MODE) {
    logoutButton.hidden = true;
    return;
  }
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out…";
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace(pageUrl("login.html"));
  });
}

// If the session is cleared (logout here or in another tab), leave the report at once.
if (!PILOT_MODE && pageMode === "protected") {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") window.location.replace(pageUrl("login.html"));
  });
}

if (pageMode === "protected") {
  protectReportGenerator();
  initLogoutButton();
} else if (pageMode === "callback") {
  completeSso();
} else {
  // "login", and the retired "signup" page which now simply points here.
  initLoginPage();
}
