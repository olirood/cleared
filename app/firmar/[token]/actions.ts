'use server';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { CONSENT_V, normName } from '@/lib/splits';

async function hash(token: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function signingView(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.rpc('signing_view', { token_hash: await hash(token) });
  return data as SigningView | null;
}

export type SigningView = {
  me: string; my_status: 'pending' | 'signed' | 'void' | 'expired'; signed_at: string | null;
  agreement: { id: string; version: number; status: string; sent_at: string | null; completed_at: string | null; content_sha256: string | null };
  work: { title: string; artist: string | null; session_date: string | null };
  workspace: { name: string; template: string };
  participants: { id: string; role: string; share_bp: number; credits: string | null; legal_name: string; credit_name: string | null; pro: string | null; ipi: string | null; publisher: string | null; signed: boolean; signed_at: string | null }[];
};

export async function sign(token: string, typedName: string, consent: boolean): Promise<{ error?: string; status?: string }> {
  const v = await signingView(token);
  if (!v) return { error: 'Este enlace no es válido.' };
  const me = v.participants.find((p) => p.id === v.me);
  if (!consent) return { error: 'Marca la casilla para aceptar la firma electrónica.' };
  if (!me || normName(typedName) !== normName(me.legal_name)) return { error: `Escribe tu nombre completo tal como aparece en la carta: ${me?.legal_name ?? ''}` };
  const h = await headers();
  const ip = (h.get('cf-connecting-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('sign_split', {
    token_hash: await hash(token), typed_name: typedName.trim(), consent_version: CONSENT_V,
    ip: /^[0-9a-fA-F:.]+$/.test(ip) ? ip : '', user_agent: (h.get('user-agent') || '').slice(0, 400),
  });
  if (error) return { error: error.message.includes('caducó') ? 'El enlace caducó. Pide uno nuevo a quien te lo mandó.' : error.message.includes('no está en firma') || error.message.includes('ya no es válido') ? 'Esta versión del split ya no está en firma. Te mandarán un enlace nuevo.' : 'No se pudo registrar tu firma. Intenta de nuevo.' };
  return { status: data as string };
}

export async function requestChange(token: string, note: string): Promise<{ error?: string }> {
  if (note.trim().length < 3) return { error: 'Escribe qué hay que cambiar.' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('request_split_change', { token_hash: await hash(token), note: note.trim().slice(0, 1000) });
  if (error) return { error: 'No se pudo enviar. Intenta de nuevo.' };
  return {};
}
