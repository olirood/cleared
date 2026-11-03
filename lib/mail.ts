// Correo saliente por SMTP (Gmail con contraseña de aplicación, o cualquier SMTP con TLS).
// La configuración vive en secretos de Cloudflare; nunca en el repo.
import { smtpSend, type Message } from './smtp';
export { mailError } from './smtp';

type Mail = Omit<Message, 'from'>;

export const mailConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.CLEARED_SERVER_KEY);

export async function sendMail(m: Mail) {
  if (!mailConfigured()) throw new Error('mail-not-configured');
  // módulo propio de Cloudflare: se carga solo en el servidor, al momento de mandar
  // (el nombre se arma en tiempo de ejecución para que el empaquetador no intente incluirlo)
  const g = globalThis as { __clearedSocketsModule?: string };
  const spec = g.__clearedSocketsModule ?? 'cloudflare:sockets';
  const { connect } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec);
  const port = Number(process.env.SMTP_PORT || 465);
  const plain = process.env.SMTP_INSECURE_TEST === '1';
  const starttls = !plain && port !== 465;          // 587 / 2525: empieza sin cifrar y sube a TLS con STARTTLS
  const socket = connect(
    { hostname: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(), port },
    { secureTransport: plain ? 'off' : starttls ? 'starttls' : 'on', allowHalfOpen: false },
  );
  const user = process.env.SMTP_USER!.trim();
  await smtpSend(
    { readable: socket.readable, writable: socket.writable, close: () => socket.close() },
    { user, pass: process.env.SMTP_PASS!.trim(), helo: 'cleared.workers.dev',
      upgrade: starttls ? () => { const t = socket.startTls(); return { readable: t.readable, writable: t.writable, close: () => t.close() }; } : undefined },
    { ...m, from: { email: (process.env.MAIL_FROM || user).trim(), name: process.env.MAIL_FROM_NAME || 'Cleared' } },
  );
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Primer nombre para el saludo ("Hola Oliver" en vez del nombre legal completo)
export const firstName = (n?: string | null) => (n || '').trim().split(/\s+/)[0] || '';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
export const P = (html: string, extra = '') => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#34343a;${extra}">${html}</p>`;

// Tabla de autores para el correo (nombre, rol, %)
export function mailWriters(rows: { name: string; role: string; pct: string }[]) {
  const tr = rows.map((r, i) => `<tr>
<td style="padding:12px 0;${i ? 'border-top:1px solid #ececef;' : ''}font-size:14px;line-height:1.35;color:#111114"><b>${esc(r.name)}</b><br><span style="color:#707078;font-size:12.5px">${esc(r.role)}</span></td>
<td style="padding:12px 0;${i ? 'border-top:1px solid #ececef;' : ''}font-size:15px;font-weight:700;color:#111114;text-align:right;white-space:nowrap;vertical-align:top">${esc(r.pct)}%</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 18px">${tr}</table>`;
}

// Recuadro gris (código, adjunto, avisos)
export const mailBox = (html: string, extra = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="background:#f4f4f6;border-radius:12px;padding:16px 18px;${extra}">${html}</td></tr></table>`;

// Correo con el estilo de Cleared; tablas para que se vea bien en Gmail, Outlook y Apple Mail
export function mailHtml(title: string, body: string, o: { preheader?: string; foot?: string } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;-webkit-text-size-adjust:100%">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:${FONT}">
<tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:30px;height:30px;border-radius:15px;background:#111114;color:#ffffff;font-size:15px;font-weight:700;text-align:center;line-height:30px">C</td>
<td style="padding-left:10px;font-size:16px;font-weight:700;color:#111114;letter-spacing:-.01em">Cleared</td></tr></table></td></tr>
<tr><td style="background:#ffffff;border-radius:18px;padding:32px 30px;box-shadow:0 1px 2px rgba(0,0,0,.05)">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;letter-spacing:-.02em;color:#111114">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 6px 0;font-size:12px;line-height:1.5;color:#8a8a92">${o.foot ?? 'Cleared · splits, label copy y firmas.<br>Si no esperabas este correo, ignóralo.'}</td></tr>
</table></td></tr></table></body></html>`;
}
