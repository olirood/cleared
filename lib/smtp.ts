// Cliente SMTP mínimo para Cloudflare Workers (TLS directo, AUTH PLAIN, MIME en base64).
// El transporte se inyecta para poder probarlo fuera de Cloudflare.

export type Duplex = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close?: () => Promise<void> | void };
export type Message = {
  from: { email: string; name?: string };
  to: { email: string; name?: string }[];
  subject: string; text: string; html?: string;
  attachments?: { filename: string; content: string; mimeType?: string }[];   // content en base64
};

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addr = (a: { email: string; name?: string }) => {
  a = { ...a, email: a.email.trim() };
  if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(a.email)) throw new Error('bad-address');
  if (!a.name) return `<${a.email}>`;
  const n = a.name.replace(/["\\\r\n]/g, '');
  return /^[\x20-\x7e]*$/.test(n) ? `"${n}" <${a.email}>` : `${word(n)} <${a.email}>`;
};

export function buildMime(m: Message, domain: string) {
  const id = crypto.randomUUID().replace(/-/g, '');
  const b1 = `mix_${id}`, b2 = `alt_${id}`;
  const head = [
    `From: ${addr(m.from)}`,
    `To: ${m.to.map(addr).join(', ')}`,
    `Subject: ${word(m.subject.replace(/[\r\n]/g, ' '))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b1}"`,
  ].join('\r\n');
  const part = (type: string, body: string) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}`;
  let out = `${head}\r\n\r\n--${b1}\r\nContent-Type: multipart/alternative; boundary="${b2}"\r\n\r\n`;
  out += `--${b2}\r\n${part('text/plain', m.text)}`;
  if (m.html) out += `--${b2}\r\n${part('text/html', m.html)}`;
  out += `--${b2}--\r\n`;
  for (const a of m.attachments ?? []) {
    const fname = word(a.filename.replace(/["\r\n]/g, ''));
    out += `--${b1}\r\nContent-Type: ${a.mimeType || 'application/octet-stream'}; name="${fname}"\r\nContent-Disposition: attachment; filename="${fname}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(a.content.replace(/\s/g, ''))}`;
  }
  out += `--${b1}--\r\n`;
  return out;
}

// upgrade: para el puerto 587 (STARTTLS) — cambia la conexión a cifrada después del primer EHLO
export async function smtpSend(io: Duplex, cfg: { user: string; pass: string; helo: string; upgrade?: () => Duplex }, m: Message) {
  let reader = io.readable.getReader();
  let writer = io.writable.getWriter();
  let buf = '';
  const reply = async (expect: number[]) => {
    const deadline = Date.now() + 20000;
    for (;;) {
      const lines = buf.split('\r\n');
      const done = lines.findIndex((l) => /^\d{3} /.test(l));
      if (done >= 0) {
        const code = Number(lines[done].slice(0, 3));
        buf = lines.slice(done + 1).join('\r\n');
        if (!expect.includes(code)) throw new Error(`smtp ${code}: ${lines.slice(0, done + 1).join(' | ').slice(0, 200)}`);
        return code;
      }
      if (Date.now() > deadline) throw new Error('smtp timeout');
      let r: ReadableStreamReadResult<Uint8Array>;
      try { r = await reader.read(); } catch (e) { throw new Error(`smtp connect: ${String((e as Error)?.message || e).slice(0, 120)}`); }
      if (r.done) throw new Error('smtp closed');
      buf += dec.decode(r.value, { stream: true });
    }
  };
  const cmd = async (line: string, expect: number[]) => {
    try { await writer.write(enc.encode(line + '\r\n')); } catch (e) { throw new Error(`smtp connect: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    return reply(expect);
  };
  try {
    await reply([220]);
    await cmd(`EHLO ${cfg.helo}`, [250]);
    if (cfg.upgrade) {
      await cmd('STARTTLS', [220]);
      reader.releaseLock(); writer.releaseLock();
      io = cfg.upgrade();
      reader = io.readable.getReader(); writer = io.writable.getWriter(); buf = '';
      await cmd(`EHLO ${cfg.helo}`, [250]);
    }
    await cmd(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`, 'utf8').toString('base64')}`, [235]);
    await cmd(`MAIL FROM:<${m.from.email}>`, [250]);
    for (const t of m.to) await cmd(`RCPT TO:<${t.email}>`, [250, 251]);
    await cmd('DATA', [354]);
    const body = buildMime(m, m.from.email.split('@')[1] || 'cleared.local');
    await writer.write(enc.encode(body.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n'));
    await reply([250]);
    await cmd('QUIT', [221]).catch(() => 0);
  } finally {
    try { reader.releaseLock(); writer.releaseLock(); } catch { /* */ }
    try { await io.close?.(); } catch { /* */ }
  }
}

// Explica en una línea por qué falló un envío (para mostrarlo en pantalla)
export function mailError(e: unknown) {
  const d = String((e as Error)?.message || e);
  const code = d.match(/smtp (\d{3})/)?.[1];
  if (code === '535' || code === '534') return 'el servidor de correo rechazó el usuario o la clave (revisa SMTP_USER y SMTP_PASS)';
  if (code) return `servidor de correo: ${code}${/not (yet )?activ|suspend|validat|verif/i.test(d) ? ', la cuenta de correo aún no está activada' : /sender|from/i.test(d) ? ', el remitente no está aprobado' : ''}`;
  if (d.includes('timeout')) return 'sin respuesta del servidor de correo';
  if (d.includes('bad-address')) return 'hay un correo mal escrito';
  if (d.includes('smtp connect') || d.includes('smtp closed')) return 'no se pudo conectar al servidor de correo (revisa SMTP_HOST y SMTP_PORT)';
  return d.slice(0, 80);
}
