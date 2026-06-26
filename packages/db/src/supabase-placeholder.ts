import type { HeatherDatabase, SupabaseRepositoryConfig } from "./types";

export function createSupabaseRepository(_config: SupabaseRepositoryConfig): HeatherDatabase {
  throw new Error(
    "Supabase repository is intentionally abstracted for phase 1. Implement this adapter with Supabase Auth, PostgreSQL tables, and pgvector when backend credentials are available."
  );
}
