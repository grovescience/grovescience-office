const ADMIN_EMAIL = "grovescience24@gmail.com";

export function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const secretKey = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !publishableKey || !secretKey) throw new Error("Supabase server configuration is incomplete");
  return { url, publishableKey, secretKey };
}

export async function requireAdmin(request) {
  const user = await requireUser(request);
  return String(user?.email || "").toLowerCase() === ADMIN_EMAIL ? user : null;
}

export async function requireUser(request) {
  const { url, publishableKey } = getSupabaseConfig();
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  return response.json();
}

export async function adminRest(path, options = {}) {
  const { url, secretKey } = getSupabaseConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export async function adminAuth(path, options = {}) {
  const { url, secretKey } = getSupabaseConfig();
  return fetch(`${url}/auth/v1/admin/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export async function adminStorage(path, options = {}) {
  const { url, secretKey } = getSupabaseConfig();
  return fetch(`${url}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      ...(options.headers || {}),
    },
  });
}
