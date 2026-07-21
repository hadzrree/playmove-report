import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const plans = new Set(["trial", "monthly", "yearly", "lifetime"]);
const statuses = new Set(["active", "suspended", "expired"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function expiryFor(plan: string) {
  if (plan === "lifetime") return null;
  const date = new Date();
  const days = plan === "trial" ? 7 : plan === "monthly" ? 30 : 365;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase Edge Function environment variables." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Missing Authorization bearer token." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: authUser, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authUser.user) return json({ error: "Invalid session." }, 401);

  const { data: adminProfile, error: adminProfileError } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("id", authUser.user.id)
    .maybeSingle();
  if (adminProfileError) return json({ error: adminProfileError.message }, 500);
  if (!adminProfile?.is_admin) return json({ error: "Administrator access required." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  try {
    const action = requireString(body.action, "action");

    if (action === "list") {
      const { data: profiles, error: profilesError } = await adminClient
        .from("profiles")
        .select("id, full_name, email, created_at")
        .order("created_at", { ascending: false });
      if (profilesError) throw profilesError;

      const userIds = (profiles || []).map((profile) => profile.id);
      const { data: subscriptions, error: subscriptionsError } = userIds.length
        ? await adminClient
          .from("subscriptions")
          .select("user_id, plan, status, expiry_date")
          .in("user_id", userIds)
        : { data: [], error: null };
      if (subscriptionsError) throw subscriptionsError;

      const subscriptionByUserId = new Map((subscriptions || []).map((subscription) => [subscription.user_id, subscription]));
      const users = (profiles || []).map((profile) => {
        const subscription = subscriptionByUserId.get(profile.id);
        return {
          user_id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          plan: subscription?.plan || "trial",
          status: subscription?.status || "active",
          expiry_date: subscription?.expiry_date || null,
        };
      });
      return json({ users });
    }

    if (action === "create") {
      const full_name = requireString(body.full_name, "Full Name");
      const email = requireString(body.email, "Email").toLowerCase();
      const password = requireString(body.password, "Password");
      const plan = requireString(body.plan, "Plan").toLowerCase();
      const status = requireString(body.status, "Status").toLowerCase();
      if (!plans.has(plan)) throw new Error("Invalid plan.");
      if (!new Set(["active", "suspended"]).has(status)) throw new Error("Invalid status.");

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createError) throw createError;
      const userId = created.user.id;

      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: userId,
        full_name,
        email,
        is_admin: false,
      });
      if (profileError) throw profileError;

      const { error: subscriptionError } = await adminClient.from("subscriptions").upsert({
        user_id: userId,
        plan,
        status,
        expiry_date: expiryFor(plan),
      });
      if (subscriptionError) throw subscriptionError;

      return json({ user_id: userId });
    }

    if (action === "update") {
      const user_id = requireString(body.user_id, "user_id");
      const plan = requireString(body.plan, "Plan").toLowerCase();
      const status = requireString(body.status, "Status").toLowerCase();
      const expiry_date = body.expiry_date === null || body.expiry_date === "" ? null : requireString(body.expiry_date, "Expiry Date");
      if (!plans.has(plan)) throw new Error("Invalid plan.");
      if (!statuses.has(status)) throw new Error("Invalid status.");

      const { error } = await adminClient.from("subscriptions").upsert({
        user_id,
        plan,
        status,
        expiry_date: plan === "lifetime" ? null : expiry_date,
      });
      if (error) throw error;
      return json({ user_id });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed." }, 400);
  }
});
