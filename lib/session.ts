import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type Member = { workspace_id: string; role: 'owner' | 'admin' | 'operator' | 'viewer'; display_name: string | null };

// Sesión + espacios del usuario; manda a /login si no hay sesión
export async function requireSession() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await sb.from('memberships').select('workspace_id, role, display_name').eq('user_id', user.id).order('created_at');
  const memberships = (data ?? []) as Member[];
  const name = memberships.find((m) => m.display_name)?.display_name || user.email || '';
  return { sb, user, memberships, name };
}

export async function signedUrls(sb: Awaited<ReturnType<typeof supabaseServer>>, keys: (string | null | undefined)[]) {
  const list = [...new Set(keys.filter(Boolean) as string[])];
  if (!list.length) return {} as Record<string, string>;
  const { data } = await sb.storage.from('cleared').createSignedUrls(list, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string])) as Record<string, string>;
}
