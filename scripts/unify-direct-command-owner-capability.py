from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_required(path: str, old: str, new: str) -> None:
    content = read(path)
    if new in content:
        return
    count = content.count(old)
    if count < 1:
        raise SystemExit(f"{path}: required Direct Command capability pattern was not found")
    write(path, content.replace(old, new))


# One immutable Supabase user UUID is the authority. The email is retained only
# as readable documentation; provider metadata is not allowed to revoke the
# owner's capability after the account has already been identified by UUID.
write(
    "apps/web/lib/security/heather-owner.ts",
    '''import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const HEATHER_OWNER_USER_ID = "6ce9c496-e85f-4931-b6f4-737a7f2fd4d8";
export const HEATHER_OWNER_EMAIL = "waterfallingsound0827@gmail.com";

export type HeatherOwnerContext = { client: SupabaseClient; user: User };

export class HeatherOwnerAccessError extends Error {
  constructor(message = "Not found.", readonly status = 404) {
    super(message);
  }
}

export async function getAuthenticatedRequestContext(request: Request): Promise<HeatherOwnerContext | null> {
  return getAuthenticatedContextFromAuthorization(request.headers.get("authorization"));
}

export async function getAuthenticatedRequestUser(request: Request): Promise<User | null> {
  return (await getAuthenticatedRequestContext(request))?.user || null;
}

export async function getAuthenticatedContextFromAuthorization(authorization: string | null): Promise<HeatherOwnerContext | null> {
  const token = authorization?.replace(/^Bearer\\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : { client, user: data.user };
}

export async function getAuthenticatedUserFromAuthorization(authorization: string | null): Promise<User | null> {
  return (await getAuthenticatedContextFromAuthorization(authorization))?.user || null;
}

export function isConfiguredHeatherOwner(user: Pick<User, "id" | "email"> | null): boolean {
  return Boolean(user && user.id === HEATHER_OWNER_USER_ID);
}

export async function getHeatherOwnerContext(request: Request): Promise<HeatherOwnerContext | null> {
  const context = await getAuthenticatedRequestContext(request);
  return context && isConfiguredHeatherOwner(context.user) ? context : null;
}

export async function requireHeatherOwnerContext(request: Request): Promise<HeatherOwnerContext> {
  const context = await getHeatherOwnerContext(request);
  if (!context) throw new HeatherOwnerAccessError();
  return context;
}

export async function getHeatherOwner(request: Request): Promise<User | null> {
  return (await getHeatherOwnerContext(request))?.user || null;
}

export async function requireHeatherOwner(request: Request): Promise<User> {
  return (await requireHeatherOwnerContext(request)).user;
}

export function ownerAccessStatus(error: unknown) {
  return error instanceof HeatherOwnerAccessError ? error.status : 400;
}
'''
)

# The authenticated Supabase client that proved page access must also perform
# every Direct Command read/write. This removes the second, unrelated service-
# role/anonymous-client gate that previously caused visible pages to fail writes.
repo_path = "apps/web/lib/intent/direct-command-repository.ts"
repo = read(repo_path)
old_generated = '''  constructor(ownerUserId?: string) {
    const configuredOwner = ownerUserId && isUuid(ownerUserId) ? ownerUserId : null;
    this.ownerConfigured = Boolean(configuredOwner);
    this.ownerUserId = configuredOwner || "00000000-0000-4000-8000-000000000000";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    this.client = configuredOwner && url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
    this.memory = ownerMemory.get(this.ownerUserId) ?? { commands: [], patterns: new Map(), processedMessageIds: new Set() };
    ownerMemory.set(this.ownerUserId, this.memory);
  }
'''
new_generated = '''  constructor(ownerUserId?: string, authenticatedClient?: SupabaseClient | null) {
    const configuredOwner = ownerUserId && isUuid(ownerUserId) ? ownerUserId : null;
    this.ownerConfigured = Boolean(configuredOwner);
    this.ownerUserId = configuredOwner || "00000000-0000-4000-8000-000000000000";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client = authenticatedClient ?? (configuredOwner && url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null);
    this.memory = ownerMemory.get(this.ownerUserId) ?? { commands: [], patterns: new Map(), processedMessageIds: new Set() };
    ownerMemory.set(this.ownerUserId, this.memory);
  }
'''
if new_generated not in repo:
    if old_generated not in repo:
        raise SystemExit(f"{repo_path}: generated constructor was not found")
    repo = repo.replace(old_generated, new_generated, 1)
write(repo_path, repo)

# CRUD/import/export routes use the same authenticated owner context that made
# the registration page visible. There is no additional account confirmation.
route_paths = [
    "apps/web/app/api/direct-commands/route.ts",
    "apps/web/app/api/direct-commands/[id]/route.ts",
    "apps/web/app/api/direct-commands/import/route.ts",
    "apps/web/app/api/direct-commands/export/route.ts",
    "apps/web/app/api/direct-commands/bulk-import/preview/route.ts",
    "apps/web/app/api/direct-commands/bulk-import/commit/route.ts",
]
for path in route_paths:
    content = read(path)
    content = content.replace("requireHeatherOwner }", "requireHeatherOwnerContext }")
    content = content.replace(
        "const owner = await requireHeatherOwner(request);",
        "const { user: owner, client } = await requireHeatherOwnerContext(request);",
    )
    content = content.replace(
        "new DirectCommandRepository(owner.id)",
        "new DirectCommandRepository(owner.id, client)",
    )
    if "requireHeatherOwner(request)" in content or "new DirectCommandRepository(owner.id)" in content:
        raise SystemExit(f"{path}: owner capability was not fully unified")
    write(path, content)

# Direct Command execution in personal chat, research chat, and the legacy
# resolver uses the same owner-authenticated client, so newly registered rows
# are immediately readable without a service-role dependency.
chat_patches = {
    "apps/web/app/api/chat/route.ts": [
        ("import { getHeatherOwner } from \"../../../lib/security/heather-owner\";", "import { getHeatherOwnerContext } from \"../../../lib/security/heather-owner\";"),
        ("const directOwner = await getHeatherOwner(request);", "const directOwner = await getHeatherOwnerContext(request);"),
        ("new DirectCommandRepository(directOwner.id)", "new DirectCommandRepository(directOwner.user.id, directOwner.client)"),
    ],
    "apps/web/app/api/research/chat/route.ts": [
        ("import { getHeatherOwner } from \"../../../../lib/security/heather-owner\";", "import { getHeatherOwnerContext } from \"../../../../lib/security/heather-owner\";"),
        ("const directOwner = await getHeatherOwner(request);", "const directOwner = await getHeatherOwnerContext(request);"),
        ("new DirectCommandRepository(directOwner.id)", "new DirectCommandRepository(directOwner.user.id, directOwner.client)"),
    ],
    "apps/web/app/api/intent/resolve/route.ts": [
        ("import { getHeatherOwner } from \"../../../../lib/security/heather-owner\";", "import { getHeatherOwnerContext } from \"../../../../lib/security/heather-owner\";"),
        ("const directOwner = await getHeatherOwner(request);", "const directOwner = await getHeatherOwnerContext(request);"),
        ("new DirectCommandRepository(directOwner.id)", "new DirectCommandRepository(directOwner.user.id, directOwner.client)"),
    ],
}
for path, patches in chat_patches.items():
    content = read(path)
    for old, new in patches:
        if new not in content:
            if old not in content:
                raise SystemExit(f"{path}: expected generated owner route pattern not found")
            content = content.replace(old, new)
    write(path, content)

# Generated tests now assert that the immutable UUID alone identifies the
# waterfalling owner; an altered/missing provider email cannot block access.
test_path = ROOT / "apps/web/tests/heather-owner-access.test.ts"
if test_path.exists():
    test_path.write_text(
        '''import assert from "node:assert/strict";
import test from "node:test";
import {
  HEATHER_OWNER_EMAIL,
  HEATHER_OWNER_USER_ID,
  isConfiguredHeatherOwner
} from "../lib/security/heather-owner";

test("anonymous and different Supabase users are denied", () => {
  assert.equal(isConfiguredHeatherOwner(null), false);
  assert.equal(isConfiguredHeatherOwner({ id: "22222222-2222-4222-8222-222222222222", email: HEATHER_OWNER_EMAIL }), false);
});

test("the immutable waterfalling user id grants the Direct Command capability", () => {
  assert.equal(isConfiguredHeatherOwner({ id: HEATHER_OWNER_USER_ID, email: HEATHER_OWNER_EMAIL }), true);
  assert.equal(isConfiguredHeatherOwner({ id: HEATHER_OWNER_USER_ID, email: undefined }), true);
  assert.equal(isConfiguredHeatherOwner({ id: HEATHER_OWNER_USER_ID, email: "provider-alias@example.com" }), true);
});
''',
        encoding="utf-8",
    )

print("Direct Command page visibility and registration capability unified.")
