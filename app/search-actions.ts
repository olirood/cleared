'use server';
// Búsqueda rápida (⌘K): tracks, splits y personas que tú puedes ver (los permisos de la base deciden)
import { supabaseServer } from '@/lib/supabase/server';

export type Hit = { kind: 'track' | 'split' | 'person'; id: string; title: string; sub: string; href: string };

export async function quickSearch(raw: string): Promise<Hit[]> {
  // fuera caracteres que cambian el sentido del filtro
  const q = raw.replace(/[%*,()\\"'.:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const sb = await supabaseServer();
  const [recs, works, people] = await Promise.all([
    sb.from('recordings').select('id, title, version_title, main_artist, isrc').or(`title.ilike.${like},main_artist.ilike.${like},isrc.ilike.${like},release_title.ilike.${like}`).limit(6),
    sb.from('works').select('id, title, artist, session_with').or(`title.ilike.${like},artist.ilike.${like},session_with.ilike.${like}`).limit(6),
    sb.from('people').select('id, legal_name, credit_name, ipi').or(`legal_name.ilike.${like},credit_name.ilike.${like},ipi.ilike.${like}`).limit(6),
  ]);
  return [
    ...(recs.data ?? []).map((r) => ({ kind: 'track' as const, id: r.id, title: r.title + (r.version_title ? ` (${r.version_title})` : ''), sub: [r.main_artist, r.isrc].filter(Boolean).join(' · ') || 'Track', href: `/tracks/${r.id}` })),
    ...(works.data ?? []).map((w) => ({ kind: 'split' as const, id: w.id, title: w.title, sub: [w.artist, w.session_with && `Sesión con ${w.session_with}`].filter(Boolean).join(' · ') || 'Split', href: `/splits/${w.id}` })),
    ...(people.data ?? []).map((p) => ({ kind: 'person' as const, id: p.id, title: p.legal_name, sub: [p.credit_name, p.ipi && `IPI ${p.ipi}`].filter(Boolean).join(' · ') || 'Persona', href: `/directorio?p=${p.id}` })),
  ];
}
