// Authentication behavior shared by the protected report and the auth pages.
import { PILOT_MODE, supabase, hasSupabaseConfig } from "./supabase.js";

// Read the page mode from the script tag so this file can be reused without build tools.
const scriptTag = [...document.scripts].find((script) => script.src.endsWith("/auth.js") || script.src.endsWith("auth.js"));
const pageMode = scriptTag?.dataset.authPage || "protected";

// Resolve sibling pages correctly on GitHub Pages project sites and local file paths.
const pageUrl = (page) => new URL(page, window.location.href).toString();

// Show a short status message in auth forms while keeping the existing visual style.
function setAuthMessage(message, isError = false) {
  const box = document.querySelector("[data-auth-message]");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("flag", isError);
  box.classList.toggle("ok", !isError && Boolean(message));
  box.style.display = message ? "block" : "none";
}

// Redirect unauthenticated visitors away from the report generator.
async function protectReportGenerator() {
  if (PILOT_MODE) return;

  if (!hasSupabaseConfig()) {
    document.body.innerHTML = `<main style="max-width:720px;margin:40px auto;padding:24px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif">
      <div style="background:#FFF4E5;border:1px solid #ED7D31;border-radius:12px;padding:18px;color:#8A4B00">
        <h1 style="margin:0 0 8px;color:#252A64;font-size:20px">Supabase setup required</h1>
        <p style="line-height:1.5">Update <code>supabase.js</code> with your Supabase project URL and anon public key before using authentication.</p>
      </div>
    </main>`;
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.replace(pageUrl("login.html"));
  }
}

// Send authenticated users away from login/signup and into the report generator.
async function redirectIfAlreadyLoggedIn() {
  if (PILOT_MODE) {
    window.location.replace(pageUrl("index.html"));
    return;
  }

  if (!hasSupabaseConfig()) {
    setAuthMessage("Update supabase.js with your Supabase URL and anon key before signing in.", true);
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.replace(pageUrl("index.html"));
}

// Wire the login form to Supabase email/password sign-in.
function initLoginForm() {
  if (PILOT_MODE) return;

  const form = document.querySelector("[data-login-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Signing you in…");
    const formData = new FormData(form);
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (error) {
      setAuthMessage(error.message, true);
      return;
    }
    window.location.replace(pageUrl("index.html"));
  });
}

// Wire the signup form to Supabase email/password registration.
function initSignupForm() {
  if (PILOT_MODE) return;

  const form = document.querySelector("[data-signup-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Creating your account…");
    const formData = new FormData(form);
    const { error } = await supabase.auth.signUp({
      email: formData.get("email"),
      password: formData.get("password"),
      options: { emailRedirectTo: pageUrl("index.html") },
    });
    if (error) {
      setAuthMessage(error.message, true);
      return;
    }
    setAuthMessage("Account created. Check your email if confirmation is enabled, then return to log in.");
  });
}

// Attach logout to the report header and return the user to the login page.
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
    await supabase.auth.signOut();
    window.location.replace(pageUrl("login.html"));
  });
}

// Keep every open tab in sync when Supabase restores, refreshes, or clears sessions.
if (!PILOT_MODE) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (pageMode === "protected" && !session) window.location.replace(pageUrl("login.html"));
    if ((pageMode === "login" || pageMode === "signup") && session) window.location.replace(pageUrl("index.html"));
  });
}

if (pageMode === "protected") {
  protectReportGenerator();
  initLogoutButton();
} else {
  redirectIfAlreadyLoggedIn();
  initLoginForm();
  initSignupForm();
}
