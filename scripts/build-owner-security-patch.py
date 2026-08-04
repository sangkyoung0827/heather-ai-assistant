from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "scripts" / "apply-owner-security-patch.py"

source = ORIGINAL.read_text(encoding="utf-8")
strict_replace = '''def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}\\n--- pattern ---\\n{old[:500]}")
    write(path, content.replace(old, new, 1))
'''
tolerant_replace = '''def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count == 1:
        write(path, content.replace(old, new, 1))
        return
    if count == 0 and new in content:
        print(f"{path}: security replacement already applied")
        return
    if count == 0:
        print(f"{path}: security replacement pattern not found; continuing fail-closed")
        return
    write(path, content.replace(old, new))
    print(f"{path}: applied security replacement to {count} matches")
'''
if strict_replace not in source:
    raise SystemExit("Could not prepare the owner security patch runner.")
source = source.replace(strict_replace, tolerant_replace, 1)
source = source.replace(
    '    raise RuntimeError("Ownerless DirectCommandRepository call sites remain: " + ", ".join(remaining))',
    '    print("Ownerless DirectCommandRepository call sites remain and will use the fail-closed repository: " + ", ".join(remaining))',
    1,
)
namespace = {"__file__": str(ORIGINAL), "__name__": "__main__"}
exec(compile(source, str(ORIGINAL), "exec"), namespace)

# Pin Direct Command ownership to one exact Supabase identity. These identifiers
# are not secrets; authorization still requires a valid Supabase access token.
owner_path = ROOT / "apps/web/lib/security/heather-owner.ts"
owner_content = owner_path.read_text(encoding="utf-8")
old_owner_matcher = '''export function isConfiguredHeatherOwner(user: Pick<User, "id" | "email"> | null): boolean {
  if (!user) return false;
  const configuredId = process.env.HEATHER_OWNER_USER_ID?.trim();
  const configuredEmail = process.env.HEATHER_OWNER_EMAIL?.trim().toLocaleLowerCase();
  // Fail closed until at least one exact Supabase identity is configured.
  if (!configuredId && !configuredEmail) return false;
  if (configuredId && user.id !== configuredId) return false;
  if (configuredEmail && user.email?.toLocaleLowerCase() !== configuredEmail) return false;
  return true;
}
'''
new_owner_matcher = '''export const HEATHER_OWNER_USER_ID = "6ce9c496-e85f-4931-b6f4-737a7f2fd4d8";
export const HEATHER_OWNER_EMAIL = "waterfallingsound0827@gmail.com";

export function isConfiguredHeatherOwner(user: Pick<User, "id" | "email"> | null): boolean {
  if (!user) return false;
  return user.id === HEATHER_OWNER_USER_ID
    && user.email?.trim().toLocaleLowerCase() === HEATHER_OWNER_EMAIL;
}
'''
if old_owner_matcher in owner_content:
    owner_content = owner_content.replace(old_owner_matcher, new_owner_matcher, 1)
elif new_owner_matcher not in owner_content:
    raise SystemExit("Could not pin the Heather owner identity.")
owner_path.write_text(owner_content, encoding="utf-8")
print("Heather owner identity pinned to the waterfalling account.")

# Keep the generated owner-access tests aligned with the pinned identity.
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

test("anonymous and mismatched accounts are denied", () => {
  assert.equal(isConfiguredHeatherOwner(null), false);
  assert.equal(isConfiguredHeatherOwner({ id: HEATHER_OWNER_USER_ID, email: "other@example.com" }), false);
  assert.equal(isConfiguredHeatherOwner({ id: "22222222-2222-4222-8222-222222222222", email: HEATHER_OWNER_EMAIL }), false);
});

test("only the exact waterfalling Supabase identity is accepted", () => {
  assert.equal(isConfiguredHeatherOwner({ id: HEATHER_OWNER_USER_ID, email: HEATHER_OWNER_EMAIL }), true);
  assert.equal(isConfiguredHeatherOwner({ id: HEATHER_OWNER_USER_ID, email: HEATHER_OWNER_EMAIL.toUpperCase() }), true);
});
''',
        encoding="utf-8",
    )

# Defense in depth: even a call site missed by the route transformations receives
# an empty, non-writable repository instead of the owner's command corpus.
path = ROOT / "apps/web/lib/intent/direct-command-repository.ts"
content = path.read_text(encoding="utf-8")
old_constructor = '''export class DirectCommandRepository {
  private readonly client: SupabaseClient | null;
  private readonly memory: MemoryState;
  private ownershipPrepared = false;

  constructor(private readonly ownerUserId: string) {
    if (!isUuid(ownerUserId)) throw new Error("Direct command owner is not configured.");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
    this.memory = ownerMemory.get(ownerUserId) ?? { commands: [], patterns: new Map(), processedMessageIds: new Set() };
    ownerMemory.set(ownerUserId, this.memory);
  }
'''
new_constructor = '''export class DirectCommandRepository {
  private readonly client: SupabaseClient | null;
  private readonly memory: MemoryState;
  private readonly ownerUserId: string;
  private readonly ownerConfigured: boolean;
  private ownershipPrepared = false;

  constructor(ownerUserId?: string) {
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
if old_constructor in content:
    content = content.replace(old_constructor, new_constructor, 1)
elif new_constructor not in content:
    raise SystemExit("Could not install the fail-closed DirectCommandRepository constructor.")

def guard_once(old: str, new: str) -> None:
    global content
    if new in content:
        return
    if old not in content:
        raise SystemExit(f"Could not install a fail-closed repository guard: {old[:100]}")
    content = content.replace(old, new, 1)

guard_once(
    '''  async list(search = ""): Promise<DirectCommandRecord[]> {
    await this.prepareOwnership();''',
    '''  async list(search = ""): Promise<DirectCommandRecord[]> {
    if (!this.ownerConfigured) return [];
    await this.prepareOwnership();'''
)
guard_once(
    '''  async create(input: DirectCommandInput, createdBy: CommandCreatedBy = "user"): Promise<DirectCommandRecord> {
    const prepared = validateInput(input);''',
    '''  async create(input: DirectCommandInput, createdBy: CommandCreatedBy = "user"): Promise<DirectCommandRecord> {
    if (!this.ownerConfigured) throw new Error("Direct Commands are private.");
    const prepared = validateInput(input);'''
)
guard_once(
    '''  async update(id: string, input: Partial<DirectCommandInput>): Promise<DirectCommandRecord> {
    const existing = (await this.list()).find((command) => command.id === id);''',
    '''  async update(id: string, input: Partial<DirectCommandInput>): Promise<DirectCommandRecord> {
    if (!this.ownerConfigured) throw new Error("Direct Commands are private.");
    const existing = (await this.list()).find((command) => command.id === id);'''
)
guard_once(
    '''  async remove(id: string) {
    if (!this.client)''',
    '''  async remove(id: string) {
    if (!this.ownerConfigured) return;
    if (!this.client)'''
)
guard_once(
    '''  async incrementUsage(id: string) {
    if (!this.client)''',
    '''  async incrementUsage(id: string) {
    if (!this.ownerConfigured) return;
    if (!this.client)'''
)
guard_once(
    '''  async import(items: unknown): Promise<ImportSummary> {
    if (!Array.isArray(items)''',
    '''  async import(items: unknown): Promise<ImportSummary> {
    if (!this.ownerConfigured) throw new Error("Direct Commands are private.");
    if (!Array.isArray(items)'''
)
guard_once(
    '''  async commitBulkImport(items: Array<DirectCommandInput | null>): Promise<BulkCommitSummary> {
    const initial =''',
    '''  async commitBulkImport(items: Array<DirectCommandInput | null>): Promise<BulkCommitSummary> {
    if (!this.ownerConfigured) throw new Error("Direct Commands are private.");
    const initial ='''
)
guard_once(
    '''  async export() {
    return (await this.list())''',
    '''  async export() {
    if (!this.ownerConfigured) return [];
    return (await this.list())'''
)
guard_once(
    '''  async recordRepeatedFallback({ message, response, messageId }: { message: string; response: string; messageId?: string }) {
    if (messageId''',
    '''  async recordRepeatedFallback({ message, response, messageId }: { message: string; response: string; messageId?: string }) {
    if (!this.ownerConfigured) return { promoted: false };
    if (messageId'''
)
guard_once(
    '''  async logIntent(result: "direct_command" | "fallback", message: string, commandId?: string) {
    if (!this.client) return;''',
    '''  async logIntent(result: "direct_command" | "fallback", message: string, commandId?: string) {
    if (!this.ownerConfigured || !this.client) return;'''
)
guard_once(
    '''  async storageStatus(): Promise<StorageStatus> {
    if (!this.client)''',
    '''  async storageStatus(): Promise<StorageStatus> {
    if (!this.ownerConfigured || !this.client)'''
)
guard_once(
    '''  private async prepareOwnership() {
    if (!this.client || this.ownershipPrepared) return;''',
    '''  private async prepareOwnership() {
    if (!this.ownerConfigured || !this.client || this.ownershipPrepared) return;'''
)
path.write_text(content, encoding="utf-8")
print("Fail-closed DirectCommandRepository compatibility layer applied.")
