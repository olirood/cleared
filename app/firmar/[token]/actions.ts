'use server';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { CONSENT_V, normName } from '@/lib/splits';
import { esc, mailConfigured, mailHtml, sendMail } from '@/lib/mail';
import { sendFinalDocument } from '@/lib/finalMail';

async function hash(token: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const validToken = (t: string) => /^[A-Za-z0-9_-]{20,60}$/.test(t);   // enlaces nuevos: 22; los anteriores: 43

export type SigningView = {
  me: string; my_status: 'pending' | 'signed' | 'void' | 'expired'; signed_at: string | null; email_hint: string | null;
  agreement: { id: string; version: number; status: string; sent_at: string | null; completed_at: string | null; content_sha256: string | null };
  work: { title: string; artist: string | null; session_date: string | null };
  workspace: { name: string; template: string };
  participants: { id: string; role: string; share_bp: number; credits: string | null; legal_name: string; credit_name: string | null; pro: string | null; ipi: string | null; publisher: string | null; signed: boolean; signed_at: string | null }[];
};

export async function signingView(token: string) {
  if (!validToken(token)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.rpc('signing_view', { token_hash: await hash(token) });
  return data as SigningView | null;
}

// Manda un código de 6 dígitos al correo congelado en el split
export async function requestCode(token: string): Promise<{ error?: string; ok?: boolean }> {
  if (!validToken(token)) return { error: 'Este enlace no es válido.' };
  if (!mailConfigured()) return { error: 'El correo de Cleared aún no está configurado. Avísale a quien te mandó el enlace.' };
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('prepare_signing_code', { token_hash: await hash(token), code, server_key: process.env.CLEARED_SERVER_KEY });
  if (error) {
    const m = error.message;
    console.error('[cleared] prepare_signing_code:', m);
    return { error: m.includes('Espera') ? 'Ya te mandamos un código. Espera 30 segundos para pedir otro.'
      : m.includes('Demasiados') ? 'Pediste demasiados códigos. Intenta en una hora.'
      : m.includes('Sin correo') ? 'Tu correo no está registrado en este split. Avísale a quien te lo mandó.'
      : 'No se pudo mandar el código. Intenta de nuevo.' };
  }
  const d = data as { email: string; name: string; title: string; workspace: string };
  try {
    await sendMail({
      to: [{ email: d.email, name: d.name }],
      subject: `${code} es tu código para firmar “${d.title}”`,
      text: `Hola ${d.name}:\n\nTu código para firmar el split de “${d.title}” (${d.workspace}) es: ${code}\n\nVence en 10 minutos. No lo compartas: escribirlo vale como tu firma.\n\nCleared`,
      html: mailHtml(`Tu código para firmar`, `<p style="margin:0 0 16px;line-height:1.5">Hola ${esc(d.name)}, este es tu código para firmar el split de <b>“${esc(d.title)}”</b> (${esc(d.workspace)}).</p>
<div style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace;background:#f2f2f3;border-radius:12px;padding:16px;text-align:center">${code}</div>
<p style="margin:16px 0 0;font-size:13px;color:#555;line-height:1.5">Vence en 10 minutos. No lo compartas con nadie: escribirlo vale como tu firma.</p>`),
    });
  } catch (e) {
    const detail = String((e as Error)?.message || e).slice(0, 160);
    console.error('[cleared] envío de código falló:', detail);
    const code = detail.match(/smtp (\d{3})/)?.[1];
    return { error: `No se pudo mandar el correo${code ? ` (servidor de correo: ${code})` : detail.includes('timeout') ? ' (sin respuesta del servidor de correo)' : ''}. Intenta de nuevo en un momento.` };
  }
  return { ok: true };
}

export async function sign(token: string, code: string, typedName: string, consent: boolean): Promise<{ error?: string; status?: string }> {
  const v = await signingView(token);
  if (!v) return { error: 'Este enlace no es válido.' };
  const me = v.participants.find((p) => p.id === v.me);
  if (!consent) return { error: 'Marca la casilla para aceptar la firma electrónica.' };
  if (!me || normName(typedName) !== normName(me.legal_name)) return { error: `Escribe tu nombre completo tal como aparece en la carta: ${me?.legal_name ?? ''}` };
  if (!/^\d{6}$/.test(code.trim())) return { error: 'Escribe el código de 6 dígitos que te llegó por correo.' };
  const h = await headers();
  const ip = (h.get('cf-connecting-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim();
  const sb = await supabaseServer();
  const tokenHash = await hash(token);
  const { data, error } = await sb.rpc('sign_split', {
    token_hash: tokenHash, code: code.trim(), typed_name: typedName.trim(), consent_version: CONSENT_V,
    ip: /^[0-9a-fA-F:.]+$/.test(ip) ? ip : '', user_agent: (h.get('user-agent') || '').slice(0, 400),
  });
  if (error) return { error: error.message.includes('caducó') ? 'El enlace caducó. Pide uno nuevo a quien te lo mandó.' : error.message.includes('no está en firma') || error.message.includes('ya no es válido') ? 'Esta versión del split ya no está en firma. Te mandarán un enlace nuevo.' : 'No se pudo registrar tu firma. Intenta de nuevo.' };
  const r = data as string;
  if (r === 'no_code') return { error: 'Primero pide tu código.' };
  if (r === 'bad_code') return { error: 'El código no coincide. Revisa el último correo que te llegó.' };
  if (r === 'code_expired') return { error: 'El código venció o se usó demasiadas veces. Pide uno nuevo.' };
  if (r === 'completed') {
    try {
      const { data: doc } = await sb.rpc('completed_document', { token_hash: tokenHash, server_key: process.env.CLEARED_SERVER_KEY });
      if (doc) await sendFinalDocument(doc);
    } catch (e) { console.error('[cleared] copia final falló:', String((e as Error)?.message || e).slice(0, 160)); /* la firma ya quedó; se puede reenviar */ }
  }
  return { status: r };
}

export async function requestChange(token: string, note: string): Promise<{ error?: string }> {
  if (note.trim().length < 3) return { error: 'Escribe qué hay que cambiar.' };
  const sb = await supabaseServer();
  const tokenHash = await hash(token);
  const { error } = await sb.rpc('request_split_change', { token_hash: tokenHash, note: note.trim().slice(0, 1000) });
  if (error) return { error: 'No se pudo enviar. Intenta de nuevo.' };
  return {};
}
