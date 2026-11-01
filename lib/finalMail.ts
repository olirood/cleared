// Correo final: el PDF con todas las firmas a cada firmante (solo servidor)
import { ROLE_EN } from './splits';
import { esc, mailConfigured, mailHtml, sendMail } from './mail';
import { fileSafe, letterPdf, rowFrom, type LetterModel } from './letter';
import { APOLLO_LOGO } from './apolloLogo';

// Cuando firma el último: el PDF con todas las firmas a cada firmante
export async function sendFinalDocument(data: unknown) {
  if (!mailConfigured() || !data) return;
  type Snap = { legal_name?: string; credit_name?: string; publisher?: string; pro?: string; ipi?: string; email?: string; phone?: string };
  const d = data as {
    agreement: { version: number; status: string; template: string | null; sent_at: string; completed_at: string; content_sha256: string };
    work: { title: string; artist: string | null; session_date: string | null }; workspace: { name: string; template: string };
    participants: { role: string; share_bp: number; credits: string | null; snapshot: Snap; status: string; signed_at: string; typed_name: string; method: string; ip: string | null }[];
    log: { at: string; action: string; detail: Record<string, unknown> | null }[] | null;
  };
  const LOG: Record<string, string> = { created: 'Split creado', sent: 'Cerrado y enviado a firma', approved: 'Aprobado por el espacio que representa', link_issued: 'Enlace de firma generado', signed: 'Firmó', completed: 'Firmado por todas las partes', new_version: 'Versión nueva creada' };
  const m: LetterModel = {
    title: d.work.title, artist: d.work.artist || '', version: d.agreement.version, status: 'signed',
    date: d.work.session_date || d.agreement.sent_at.slice(0, 10), template: d.agreement.template || d.workspace.template, workspace: d.workspace.name,
    rows: d.participants.map((p) => rowFrom({ role: p.role, share_bp: p.share_bp, credits: p.credits, snap: p.snapshot,
      sig: { status: p.status, signed_at: p.signed_at, typed_name: p.typed_name, method: p.method, ip: p.ip } })),
    hash: d.agreement.content_sha256, sentAt: d.agreement.sent_at, completedAt: d.agreement.completed_at,
    log: (d.log ?? []).filter((l) => l.action !== 'change_requested').map((l) => ({ at: l.at, text: `${LOG[l.action] ?? l.action}${l.action === 'signed' && l.detail?.typed_name ? ` ${l.detail.typed_name}` : ''}` })),
  };
  const pdf = await letterPdf(m, m.template === 'apollo' ? APOLLO_LOGO : null);
  const b64 = Buffer.from(await pdf.arrayBuffer()).toString('base64');
  const name = `Split ${fileSafe(d.work.title)} v${d.agreement.version} firmado.pdf`;
  const lines = d.participants.map((p) => `${p.snapshot.legal_name} · ${ROLE_EN[p.role] ?? p.role} · ${(p.share_bp / 100).toFixed(2).replace(/\.00$/, '')} %`);
  const to = d.participants.map((p) => ({ email: p.snapshot.email!, name: p.snapshot.legal_name })).filter((x) => x.email);
  for (const r of to) {
    await sendMail({
      to: [r],
      subject: `Split firmado: “${d.work.title}”`,
      text: `Hola ${r.name}:\n\nTodas las partes firmaron el split de “${d.work.title}” (${d.workspace.name}, versión ${d.agreement.version}).\n\n${lines.join('\n')}\n\nTe adjuntamos el documento con todas las firmas y su constancia. Guárdalo: es tu original.\nHuella SHA-256: ${d.agreement.content_sha256}\n\nCleared`,
      html: mailHtml('Split firmado por todas las partes', `<p style="margin:0 0 12px;line-height:1.5">Hola ${esc(r.name ?? '')}, todas las partes firmaron el split de <b>“${esc(d.work.title)}”</b> (${esc(d.workspace.name)}, versión ${d.agreement.version}).</p>
<ul style="padding-left:18px;margin:0 0 12px;line-height:1.6">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p style="margin:0 0 12px;line-height:1.5">Te adjuntamos el documento con todas las firmas y su constancia. Guárdalo: es tu original.</p>
<p style="margin:0;font-size:11px;color:#777;word-break:break-all">Huella SHA-256: ${esc(d.agreement.content_sha256)}</p>`),
      attachments: [{ filename: name, content: b64, mimeType: 'application/pdf' }],
    });
  }
}

