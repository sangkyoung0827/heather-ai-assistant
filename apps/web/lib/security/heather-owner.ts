import { createClient, type User } from "@supabase/supabase-js";

export const HEATHER_OWNER_USER_ID = "6ce9c496-e85f-4931-b6f4-737a7f2fd4d8";
export const HEATHER_OWNER_EMAIL = "waterfallingsound0827@gmail.com";

export class HeatherOwnerAccessError extends Error {
  constructor(message = "Not found.", readonly status = 404) {
    super(message);
  }
}

export async function getAuthenticatedRequestUser(request: Request): Promise<User | null> {
  return getAuthenticatedUserFromAuthorization(request.headers.get("authorization"));
}

export async function getAuthenticatedUserFromAuthorization(authorization: string | null): Promise<User | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
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

export function isConfiguredHeatherOwner(user: Pick<User, "id" | "email"> | null): boolean {
  if (!user) return false;
  return user.id === HEATHER_OWNER_USER_ID
    && user.email?.trim().toLocaleLowerCase() === HEATHER_OWNER_EMAIL;
}

export async function getHeatherOwner(request: Request): Promise<User | null> {
  const user = await getAuthenticatedRequestUser(request);
  return isConfiguredHeatherOwner(user) ? user : null;
}

export async function requireHeatherOwner(request: Request): Promise<User> {
  const owner = await getHeatherOwner(request);
  if (!owner) throw new HeatherOwnerAccessError();
  return owner;
}

export function ownerAccessStatus(error: unknown) {
  return error instanceof HeatherOwnerAccessError ? error.status : 400;
}
