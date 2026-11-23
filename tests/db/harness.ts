import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * Minimal stand-in for the parts of Supabase the migration depends on:
 * roles (anon/authenticated/service_role) and auth.users / auth.uid().
 * The real migration SQL is then applied unchanged.
 */
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function createDb() {
  const pg = await PGlite.create();
  await pg.exec(SHIM);
  const migration = readFileSync(join(__dirname, "../../supabase/migrations/20261123000001_core.sql"), "utf8");
  await pg.exec(migration);

  async function asSuper() {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }

  async function createUser(email: string) {
    await asSuper();
    const id = randomUUID();
    await pg.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
    return id;
  }

  /** Run fn as an authenticated user (RLS enforced). */
  async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    await pg.exec(`reset role;`);
    if (userId) {
      await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
      await pg.exec(`set role authenticated;`);
    } else {
      await pg.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
    }
    try {
      return await fn();
    } finally {
      await asSuper();
    }
  }

  async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const r = await pg.query<T>(sql, params);
    return r.rows;
  }

  return { pg, createUser, as, q, asSuper };
}

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
