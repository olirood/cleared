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

// Correo sencillo, legible en cualquier cliente
export function mailHtml(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f2f2f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:15px;margin-bottom:20px">Cleared</div>
<div style="background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}</div>
<p style="font-size:12px;color:#777;margin-top:16px">Si no esperabas este correo, ignóralo.</p></div></body></html>`;
}
