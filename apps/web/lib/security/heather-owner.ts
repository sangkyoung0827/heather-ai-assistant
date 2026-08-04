import { createClient, type User } from "@supabase/supabase-js";

export class HeatherOwnerAccessError extends Error {
  constructor(message = "Not found.", readonly status = 404) {
    super(message);
  }
}

export async function getAuthenticatedRequestUser(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

export async function getHeatherOwner(request: Request): Promise<User | null> {
  const user = await getAuthenticatedRequestUser(request);
  if (!user) return null;

  const configuredId = process.env.HEATHER_OWNER_USER_ID?.trim();
  const configuredEmail = process.env.HEATHER_OWNER_EMAIL?.trim().toLocaleLowerCase();

  // Direct commands are intentionally fail-closed. Until at least one immutable
  // owner identifier is configured, no account receives owner access.
  if (!configuredId && !configuredEmail) return null;
  if (configuredId && user.id !== configuredId) return null;
  if (configuredEmail && user.email?.toLocaleLowerCase() !== configuredEmail) return null;
  return user;
}

export async function requireHeatherOwner(request: Request): Promise<User> {
  const owner = await getHeatherOwner(request);
  if (!owner) throw new HeatherOwnerAccessError();
  return owner;
}

export function ownerAccessStatus(error: unknown) {
  return error instanceof HeatherOwnerAccessError ? error.status : 400;
}
