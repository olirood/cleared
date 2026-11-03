// Respaldo mensual: lo llama el cron de Cloudflare (worker.ts) con la llave del servidor.
// Exporta toda la información a JSON y la manda por correo.
import { supabaseServer } from '@/lib/supabase/server';
import { P, mailConfigured, mailHtml, sendMail } from '@/lib/mail';

export async function POST(req: Request) {
  const key = process.env.CLEARED_SERVER_KEY;
  if (!key || req.headers.get('x-cleared-key') !== key) return new Response('No', { status: 403 });
  if (!mailConfigured()) return new Response('Correo no configurado', { status: 503 });
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('export_backup', { server_key: key });
  if (error || !data) return new Response('No se pudo exportar', { status: 500 });

  const d = data as Record<string, unknown[]>;
  const json = JSON.stringify(data);
  const day = new Date().toISOString().slice(0, 10);
  const count = (k: string) => (Array.isArray(d[k]) ? d[k].length : 0);
  const summary = `${count('recordings')} tracks · ${count('works')} splits · ${count('split_agreements')} versiones · ${count('people')} perfiles`;
  const to = process.env.BACKUP_TO || process.env.MAIL_FROM || process.env.SMTP_USER!;
  await sendMail({
    to: [{ email: to }],
    subject: `Respaldo de Cleared · ${day}`,
    text: `Respaldo mensual de Cleared (${day}).\n${summary}\nPeso: ${(json.length / 1024).toFixed(0)} KB\n\nGuarda el archivo adjunto. Trae directorio, tracks, splits, firmas y bitácora; no incluye portadas ni PDFs subidos.\n\nCleared`,
    html: mailHtml('Respaldo mensual', P(`${summary}.`) + P(`Peso: ${(json.length / 1024).toFixed(0)} KB.`, 'font-size:13px;color:#707078;margin-top:-6px;')
      + P('Guarda el archivo adjunto. Trae directorio, tracks, splits, firmas y bitácora; no incluye portadas ni PDFs subidos (los splits firmados ya te llegan por correo).', 'margin:0;'),
      { preheader: `Respaldo de Cleared del ${day}: ${summary}` }),
    attachments: [{ filename: `cleared-respaldo-${day}.json`, content: Buffer.from(json, 'utf8').toString('base64'), mimeType: 'application/json' }],
  });
  return Response.json({ ok: true, bytes: json.length });
}
