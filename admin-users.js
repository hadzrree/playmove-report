import { PILOT_MODE, supabase, hasSupabaseConfig } from "./supabase.js";

const messageBox = document.querySelector("[data-admin-message]");
const adminSections = document.querySelectorAll("[data-admin-content]");
const createForm = document.querySelector("[data-create-user-form]");
const userList = document.querySelector("[data-user-list]");
const refreshButton = document.querySelector("[data-refresh-users]");
const pageUrl = (page) => new URL(page, window.location.href).toString();
const plans = ["trial", "monthly", "yearly", "lifetime"];
const statuses = ["active", "suspended", "expired"];

function setMessage(message, type = "notice") {
  messageBox.textContent = message;
  messageBox.className = type;
  messageBox.style.display = message ? "block" : "none";
}

function titleCase(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

async function invokeAdminUsers(action, body = {}) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message || "Admin function request failed.");
  if (data?.error) throw new Error(data.error);
  return data;
}

function options(values, selected) {
  return values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${titleCase(value)}</option>`).join("");
}

function renderUsers(users) {
  if (!users.length) {
    userList.innerHTML = `<tr><td colspan="6" class="empty">No users found.</td></tr>`;
    return;
  }
  userList.innerHTML = users.map((user) => {
    const expiryDate = user.expiry_date || "";
    return `<tr data-user-id="${user.user_id}">
      <td>${user.full_name || "—"}</td>
      <td>${user.email || "—"}</td>
      <td><select data-field="plan">${options(plans, user.plan)}</select></td>
      <td><select data-field="status">${options(statuses, user.status)}</select><span class="status-pill status-${user.status}">${titleCase(user.status)}</span></td>
      <td><input data-field="expiry_date" type="date" value="${expiryDate}" ${user.plan === "lifetime" ? "disabled" : ""}></td>
      <td><div class="actions"><button class="btn accent" type="button" data-action="edit">Edit</button><button class="btn danger" type="button" data-action="suspend">Suspend</button><button class="btn ghost" type="button" data-action="activate">Activate</button></div></td>
    </tr>`;
  }).join("");
}

async function loadUsers() {
  userList.innerHTML = `<tr><td colspan="6" class="empty">Loading users…</td></tr>`;
  const data = await invokeAdminUsers("list");
  renderUsers(data.users || []);
}

async function initAdminPage() {
  if (PILOT_MODE) {
    setMessage("Pilot Mode is enabled. Admin user management requires authenticated Supabase access.", "flag");
    return;
  }
  if (!hasSupabaseConfig()) {
    setMessage("Update supabase.js with your Supabase URL and anon key before using admin tools.", "flag");
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.replace(pageUrl("login.html"));
    return;
  }
  try {
    await loadUsers();
    adminSections.forEach((section) => { section.hidden = false; });
    setMessage("Administrator access verified.", "ok");
  } catch (error) {
    setMessage(`Admin access denied or function unavailable: ${error.message}`, "flag");
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = createForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setMessage("Creating user…", "notice");
  try {
    const formData = new FormData(createForm);
    await invokeAdminUsers("create", Object.fromEntries(formData.entries()));
    createForm.reset();
    await loadUsers();
    setMessage("User created successfully.", "ok");
  } catch (error) {
    setMessage(error.message, "flag");
  } finally {
    submitButton.disabled = false;
  }
});

userList.addEventListener("change", (event) => {
  const row = event.target.closest("tr[data-user-id]");
  if (event.target.dataset.field === "plan") {
    const expiryInput = row.querySelector("[data-field='expiry_date']");
    expiryInput.disabled = event.target.value === "lifetime";
    if (event.target.value === "lifetime") expiryInput.value = "";
  }
});

userList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr[data-user-id]");
  const user_id = row.dataset.userId;
  const payload = {
    user_id,
    plan: row.querySelector("[data-field='plan']").value,
    status: row.querySelector("[data-field='status']").value,
    expiry_date: row.querySelector("[data-field='expiry_date']").value || null,
  };
  if (button.dataset.action === "suspend") payload.status = "suspended";
  if (button.dataset.action === "activate") payload.status = "active";
  button.disabled = true;
  try {
    await invokeAdminUsers("update", payload);
    await loadUsers();
    setMessage("User subscription updated.", "ok");
  } catch (error) {
    setMessage(error.message, "flag");
  } finally {
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", async () => {
  try { await loadUsers(); setMessage("User list refreshed.", "ok"); } catch (error) { setMessage(error.message, "flag"); }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (!session) window.location.replace(pageUrl("login.html"));
});

initAdminPage();
