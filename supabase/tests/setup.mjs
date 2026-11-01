// Base de pruebas local: Postgres en memoria (PGlite) con lo mínimo que Supabase trae
// (roles, auth.users, auth.uid()) y todas las migraciones aplicadas en orden.
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import fs from 'fs';

export async function setupDb() {
  const db = new PGlite({ extensions: { citext } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  `);
  // como Supabase: permisos de tabla amplios, RLS decide
  await db.exec(`grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;`);
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  }
  const ws = Object.fromEntries((await db.query('select slug, id from workspaces')).rows.map((r) => [r.slug, r.id]));

  const as = async (uid, sql, params) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
  };
  const ok = (m) => console.log('OK  ', m);
  const bad = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const expectErr = async (label, fn) => {
    try { await fn(); bad(label + ' (no falló)'); } catch (e) { ok(label + ' → ' + e.message.split('\n')[0]); }
  };
  return { db, ws, as, ok, bad, expectErr };
}
