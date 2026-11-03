import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type Member = { workspace_id: string; role: 'owner' | 'admin' | 'operator' | 'viewer'; display_name: string | null; avatar_color?: string | null };

// Sesión + espacios del usuario, una sola vez por petición (la barra de arriba y la página la comparten)
const load = cache(async () => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  // '*' para no romper si la columna avatar_color aún no existe
  const { data } = await sb.from('memberships').select('*').eq('user_id', user.id).order('created_at');
  const memberships = ((data ?? []) as Member[]).map((m) => ({ workspace_id: m.workspace_id, role: m.role, display_name: m.display_name, avatar_color: m.avatar_color ?? null }));
  const name = memberships.find((m) => m.display_name)?.display_name || user.email || '';
  const color = memberships.find((m) => m.avatar_color)?.avatar_color ?? null;
  return { sb, user, memberships, name, color };
});

// manda a /login si no hay sesión
export async function requireSession() {
  const s = await load();
  if (!s) redirect('/login');
  return s;
}
export const currentSession = load;

export async function signedUrls(sb: Awaited<ReturnType<typeof supabaseServer>>, keys: (string | null | undefined)[]) {
  const list = [...new Set(keys.filter(Boolean) as string[])];
  if (!list.length) return {} as Record<string, string>;
  const { data } = await sb.storage.from('cleared').createSignedUrls(list, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string])) as Record<string, string>;
}
