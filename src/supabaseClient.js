const SUPABASE_BROWSER_CONFIG_KEY = "goodhr.supabase.browser-config.v1";
const SUPABASE_WORKSPACE_TABLE = "goodhr_workspaces";
const SUPABASE_JS_URL = "https://esm.sh/@supabase/supabase-js@2";

let supabaseClient = null;
let supabaseConfig = null;

export async function initSupabase() {
  const config = await resolveSupabaseConfig();
  supabaseConfig = config;

  if (!config.url || !config.anonKey) {
    return {
      configured: false,
      client: null,
      config,
      error: ""
    };
  }

  try {
    const { createClient } = await import(SUPABASE_JS_URL);
    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return {
      configured: true,
      client: supabaseClient,
      config,
      error: ""
    };
  } catch (error) {
    return {
      configured: false,
      client: null,
      config,
      error: `Nie udało się załadować klienta Supabase. ${error.message || ""}`.trim()
    };
  }
}

export function getSupabaseConfig() {
  return supabaseConfig || getStoredSupabaseConfig();
}

export function saveSupabaseBrowserConfig(input = {}) {
  const config = normalizeSupabaseConfig(input);
  if (!config.url || !config.anonKey) {
    throw new Error("Podaj URL projektu Supabase i publiczny anon key.");
  }
  localStorage.setItem(SUPABASE_BROWSER_CONFIG_KEY, JSON.stringify(config));
  supabaseConfig = config;
  supabaseClient = null;
  return config;
}

export function clearSupabaseBrowserConfig() {
  localStorage.removeItem(SUPABASE_BROWSER_CONFIG_KEY);
  supabaseConfig = null;
  supabaseClient = null;
}

export async function getSupabaseSession() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export function onSupabaseAuthStateChange(callback) {
  const client = requireSupabaseClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email, password) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(email),
    password: String(password || "")
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(email, password, name) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: normalizeEmail(email),
    password: String(password || ""),
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: {
        name: String(name || "").trim()
      }
    }
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordResetEmail(email) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: getPasswordResetRedirectUrl()
  });
  if (error) throw error;
  return data;
}

export async function updateSupabasePassword(password) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.updateUser({
    password: String(password || "")
  });
  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadSupabaseWorkspace(userId) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_WORKSPACE_TABLE)
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.state || null;
}

export async function saveSupabaseWorkspace(userId, state) {
  const client = requireSupabaseClient();
  const { error } = await client
    .from(SUPABASE_WORKSPACE_TABLE)
    .upsert({
      user_id: userId,
      state,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

  if (error) throw error;
}

async function resolveSupabaseConfig() {
  const stored = getStoredSupabaseConfig();
  const envConfig = await fetchSupabaseConfig();
  return normalizeSupabaseConfig(envConfig.url && envConfig.anonKey ? envConfig : stored);
}

async function fetchSupabaseConfig() {
  try {
    const response = await fetch("/api/supabase-config", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) return {};
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return {};
    return normalizeSupabaseConfig(await response.json());
  } catch {
    return {};
  }
}

function getStoredSupabaseConfig() {
  try {
    return normalizeSupabaseConfig(JSON.parse(localStorage.getItem(SUPABASE_BROWSER_CONFIG_KEY) || "{}"));
  } catch {
    return {};
  }
}

function normalizeSupabaseConfig(input = {}) {
  return {
    url: String(input.url || "").trim().replace(/\/+$/, ""),
    anonKey: String(input.anonKey || input.anon_key || "").trim()
  };
}

function requireSupabaseClient() {
  if (!supabaseClient) throw new Error("Supabase nie jest skonfigurowany.");
  return supabaseClient;
}

function getAuthRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/`;
}

function getPasswordResetRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/?type=recovery`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
