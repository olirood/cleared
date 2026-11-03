'use server';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { normName } from '@/lib/splits';
import { AVISOS } from '@/lib/aviso';
import { P, esc, firstName, mailBox, mailConfigured, mailError, mailHtml, sendMail } from '@/lib/mail';
import { sendFinalDocument } from '@/lib/finalMail';

async function hash(token: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const validToken = (t: string) => /^[A-Za-z0-9_-]{20,60}$/.test(t);   // enlaces nuevos: 22; los anteriores: 43

export type SigningView = {
  me: string; my_status: 'pending' | 'signed' | 'void' | 'expired'; signed_at: string | null; email_hint: string | null;
  agreement: { id: string; version: number; status: string; sent_at: string | null; completed_at: string | null; content_sha256: string | null; language?: string | null };
  work: { title: string; artist: string | null; session_date: string | null };
  workspace: { name: string; template: string };
  participants: { id: string; role: string; share_bp: number; credits: string | null; legal_name: string; credit_name: string | null; pro: string | null; ipi: string | null; publisher: string | null; signed: boolean; signed_at: string | null; signature_png?: string | null }[];
};

export async function signingView(token: string) {
  if (!validToken(token)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.rpc('signing_view', { token_hash: await hash(token) });
  return data as SigningView | null;
}

// Mensajes en el idioma que eligió quien firma
const E = {
  es: {
    invalid: 'Este enlace no es válido.', noMail: 'El correo de Cleared aún no está configurado. Avísale a quien te mandó el enlace.',
    wait: 'Ya te mandamos un código. Espera 30 segundos para pedir otro.', tooMany: 'Pediste demasiados códigos. Intenta en una hora.',
    noEmail: 'Tu correo no está registrado en este split. Avísale a quien te lo mandó.', codeFail: 'No se pudo mandar el código. Intenta de nuevo.',
    mailFail: (why: string) => `No se pudo mandar el correo (${why}).`,
    consent: 'Marca la casilla para aceptar la firma electrónica.', name: (n: string) => `Escribe tu nombre completo tal como aparece en la carta: ${n}`,
    code6: 'Escribe el código de 6 dígitos que te llegó por correo.', drawing: 'Tu firma dibujada no se pudo leer. Bórrala y vuelve a dibujarla.',
    expired: 'El enlace caducó. Pide uno nuevo a quien te lo mandó.', notOpen: 'Esta versión del split ya no está en firma. Te mandarán un enlace nuevo.',
    drawSave: 'Tu firma dibujada no se pudo guardar. Prueba con tu nombre o vuelve a dibujarla.', signFail: 'No se pudo registrar tu firma. Intenta de nuevo.',
    noCode: 'Primero pide tu código.', badCode: 'El código no coincide. Revisa el último correo que te llegó.', codeExpired: 'El código venció o se usó demasiadas veces. Pide uno nuevo.',
    write: 'Escribe qué hay que cambiar.', sendFail: 'No se pudo enviar. Intenta de nuevo.',
  },
  en: {
    invalid: 'This link is not valid.', noMail: 'Cleared email is not set up yet. Let the person who sent you the link know.',
    wait: 'We already sent you a code. Wait 30 seconds to request another.', tooMany: 'Too many codes requested. Try again in an hour.',
    noEmail: 'Your email is not on file for this split. Let the person who sent it know.', codeFail: 'Could not send the code. Please try again.',
    mailFail: () => 'Could not send the email. Please try again in a moment.',
    consent: 'Check the box to accept the electronic signature.', name: (n: string) => `Type your full name exactly as it appears in the letter: ${n}`,
    code6: 'Enter the 6-digit code we emailed you.', drawing: 'We couldn’t read your drawn signature. Clear it and draw it again.',
    expired: 'This link has expired. Ask the person who sent it for a new one.', notOpen: 'This version of the split is no longer open for signing. You will receive a new link.',
    drawSave: 'We couldn’t save your drawn signature. Try using your name or draw it again.', signFail: 'Your signature could not be recorded. Please try again.',
    noCode: 'Request your code first.', badCode: 'The code doesn’t match. Check the latest email you received.', codeExpired: 'The code expired or was used too many times. Request a new one.',
    write: 'Write what needs to change.', sendFail: 'Could not send. Please try again.',
  },
};
type L = keyof typeof E;
const lg = (l: unknown): L => (l === 'en' ? 'en' : 'es');

// Manda un código de 6 dígitos al correo congelado en el split
export async function requestCode(token: string, lang: string = 'es'): Promise<{ error?: string; ok?: boolean }> {
  const t = E[lg(lang)], en = lg(lang) === 'en';
  if (!validToken(token)) return { error: t.invalid };
  if (!mailConfigured()) return { error: t.noMail };
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('prepare_signing_code', { token_hash: await hash(token), code, server_key: process.env.CLEARED_SERVER_KEY });
  if (error) {
    const m = error.message;
    console.error('[cleared] prepare_signing_code:', m);
    return { error: m.includes('Espera') ? t.wait : m.includes('Demasiados') ? t.tooMany : m.includes('Sin correo') ? t.noEmail : t.codeFail };
  }
  const d = data as { email: string; name: string; title: string; workspace: string };
  const hi = firstName(d.name);
  try {
    await sendMail(en ? {
      to: [{ email: d.email, name: d.name }],
      subject: `${code} is your code to sign “${d.title}”`,
      text: `Hi ${hi}:\n\nYour code to sign the split for “${d.title}” (${d.workspace}) is: ${code}\n\nIt expires in 10 minutes. Don’t share it: entering it counts as your signature.\n\nCleared`,
      html: mailHtml('Your signing code',
        P(`Hi ${esc(hi)}, here is your code to sign the split for <b style="color:#111114">“${esc(d.title)}”</b> (${esc(d.workspace)}).`)
        + mailBox(`<div style="font-size:34px;font-weight:700;letter-spacing:10px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#111114;text-align:center">${code}</div>`, 'padding:22px 18px;')
        + P('Enter it on the signing page. It expires in 10 minutes.', 'margin-bottom:6px;')
        + P('Don’t share it with anyone: entering it counts as your signature.', 'margin:0;font-size:13px;color:#707078;'),
        { preheader: `${code} is your code to sign “${d.title}”. It expires in 10 minutes.`, foot: 'Cleared · splits, label copy and signatures.<br>If you weren’t expecting this email, you can ignore it.' }),
    } : {
      to: [{ email: d.email, name: d.name }],
      subject: `${code} es tu código para firmar “${d.title}”`,
      text: `Hola ${hi}:\n\nTu código para firmar el split de “${d.title}” (${d.workspace}) es: ${code}\n\nVence en 10 minutos. No lo compartas: escribirlo vale como tu firma.\n\nCleared`,
      html: mailHtml('Tu código para firmar',
        P(`Hola ${esc(hi)}, este es tu código para firmar el split de <b style="color:#111114">“${esc(d.title)}”</b> (${esc(d.workspace)}).`)
        + mailBox(`<div style="font-size:34px;font-weight:700;letter-spacing:10px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#111114;text-align:center">${code}</div>`, 'padding:22px 18px;')
        + P('Escríbelo en la página de firma. Vence en 10 minutos.', 'margin-bottom:6px;')
        + P('No lo compartas con nadie: escribirlo vale como tu firma.', 'margin:0;font-size:13px;color:#707078;'),
        { preheader: `${code} es tu código para firmar “${d.title}”. Vence en 10 minutos.` }),
    });
  } catch (e) {
    console.error('[cleared] envío de código falló:', String((e as Error)?.message || e).slice(0, 200));
    return { error: t.mailFail(mailError(e)) };
  }
  return { ok: true };
}

export async function sign(token: string, code: string, typedName: string, consent: boolean, drawing: string | null = null, lang: string = 'es'): Promise<{ error?: string; status?: string }> {
  const t = E[lg(lang)];
  const v = await signingView(token);
  if (!v) return { error: t.invalid };
  const me = v.participants.find((p) => p.id === v.me);
  if (!consent) return { error: t.consent };
  if (!me || normName(typedName) !== normName(me.legal_name)) return { error: t.name(me?.legal_name ?? '') };
  if (!/^\d{6}$/.test(code.trim())) return { error: t.code6 };
  if (drawing !== null && (typeof drawing !== 'string' || !drawing.startsWith('data:image/png;base64,') || drawing.length > 150000)) return { error: t.drawing };
  const h = await headers();
  const ip = (h.get('cf-connecting-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim();
  const sb = await supabaseServer();
  const tokenHash = await hash(token);
  const { data, error } = await sb.rpc('sign_split', {
    token_hash: tokenHash, code: code.trim(), typed_name: typedName.trim(), consent_version: AVISOS[lg(lang)].v,   // qué aviso aceptó y en qué idioma
    ip: /^[0-9a-fA-F:.]+$/.test(ip) ? ip : '', user_agent: (h.get('user-agent') || '').slice(0, 400),
    ...(drawing ? { signature_png: drawing } : {}),   // solo si la dibujó
  });
  if (error) return { error: error.message.includes('caducó') ? t.expired : error.message.includes('no está en firma') || error.message.includes('ya no es válido') ? t.notOpen : error.message.includes('dibujada') || error.message.includes('signature_png') ? t.drawSave : t.signFail };
  const r = data as string;
  if (r === 'no_code') return { error: t.noCode };
  if (r === 'bad_code') return { error: t.badCode };
  if (r === 'code_expired') return { error: t.codeExpired };
  if (r === 'completed') {
    try {
      const { data: doc } = await sb.rpc('completed_document', { token_hash: tokenHash, server_key: process.env.CLEARED_SERVER_KEY });
      if (doc) await sendFinalDocument(doc);
    } catch (e) { console.error('[cleared] copia final falló:', String((e as Error)?.message || e).slice(0, 160)); /* la firma ya quedó; se puede reenviar */ }
  }
  return { status: r };
}

export async function requestChange(token: string, note: string, lang: string = 'es'): Promise<{ error?: string }> {
  const t = E[lg(lang)];
  if (note.trim().length < 3) return { error: t.write };
  const sb = await supabaseServer();
  const tokenHash = await hash(token);
  const { error } = await sb.rpc('request_split_change', { token_hash: tokenHash, note: note.trim().slice(0, 1000) });
  if (error) return { error: t.sendFail };
  return {};
}
