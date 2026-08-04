from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/lib/intent/direct-command-repository.ts"
content = PATH.read_text(encoding="utf-8")

old_property = '''  private readonly ownerConfigured: boolean;
  private ownershipPrepared = false;
'''
new_property = '''  private readonly ownerConfigured: boolean;
  private readonly usesAuthenticatedClient: boolean;
  private ownershipPrepared = false;
'''
if new_property not in content:
    if old_property not in content:
        raise SystemExit("DirectCommandRepository owner property block was not found.")
    content = content.replace(old_property, new_property, 1)

old_constructor_flag = '''    this.ownerConfigured = Boolean(configuredOwner);
    this.ownerUserId = configuredOwner || "00000000-0000-4000-8000-000000000000";
'''
new_constructor_flag = '''    this.ownerConfigured = Boolean(configuredOwner);
    this.usesAuthenticatedClient = Boolean(authenticatedClient);
    this.ownerUserId = configuredOwner || "00000000-0000-4000-8000-000000000000";
'''
if new_constructor_flag not in content:
    if old_constructor_flag not in content:
        raise SystemExit("DirectCommandRepository constructor capability block was not found.")
    content = content.replace(old_constructor_flag, new_constructor_flag, 1)

pattern = re.compile(
    r'''  private async prepareOwnership\(\) \{\n.*?\n  \}\n\n  private async listSupabase''',
    re.DOTALL,
)
replacement = '''  private async prepareOwnership() {
    if (!this.ownerConfigured || !this.client || this.ownershipPrepared) return;

    // A browser-authenticated owner client is constrained by RLS and cannot
    // claim legacy rows whose owner_user_id is NULL. Attempting that claim
    // before every read/write blocked both single registration and bulk import.
    // New owner-scoped rows can be read and written immediately, so skip the
    // legacy backfill here. Migration 017 performs that one-time administrative
    // backfill safely in the database.
    if (this.usesAuthenticatedClient) {
      this.ownershipPrepared = true;
      return;
    }

    const claimCommands = await this.client.from("direct_commands").update({ owner_user_id: this.ownerUserId }).is("owner_user_id", null);
    if (claimCommands.error) throw new Error("Apply migration 017_direct_command_owner_write_repair.sql before using Direct Commands.");
    await this.client.from("query_patterns").update({ owner_user_id: this.ownerUserId }).is("owner_user_id", null);
    await this.client.from("intent_events").update({ owner_user_id: this.ownerUserId }).is("owner_user_id", null);
    const { data: commands, error } = await this.client.from("direct_commands").select("id").eq("owner_user_id", this.ownerUserId);
    if (error) throw error;
    const ids = (commands || []).map((row) => String(row.id));
    for (let index = 0; index < ids.length; index += 500) {
      const { error: triggerError } = await this.client.from("direct_command_triggers").update({ owner_user_id: this.ownerUserId }).in("command_id", ids.slice(index, index + 500)).is("owner_user_id", null);
      if (triggerError) throw triggerError;
    }
    this.ownershipPrepared = true;
  }

  private async listSupabase'''

if "if (this.usesAuthenticatedClient)" not in content:
    content, count = pattern.subn(replacement, content, count=1)
    if count != 1:
        raise SystemExit("DirectCommandRepository prepareOwnership block was not found.")

PATH.write_text(content, encoding="utf-8")
print("Direct Command authenticated write path fixed.")
