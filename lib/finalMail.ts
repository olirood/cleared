// Split firmado: el PDF final (servidor), su envío por correo y su archivo en el almacén
import { ROLE_EN } from './splits';
import { esc, mailConfigured, mailHtml, sendMail } from './mail';
import { fileSafe, letterPdf, rowFrom, type LetterModel } from './letter';
import { APOLLO_LOGO } from './apolloLogo';

type Snap = { legal_name?: string; credit_name?: string; publisher?: string; pro?: string; ipi?: string; email?: string; phone?: string };
export type FinalDoc = {
  agreement: { id: string; version: number; status: string; template: string | null; sent_at: string; completed_at: string; content_sha256: string };
  work: { id: string; title: string; artist: string | null; session_date: string | null }; workspace: { id: string; name: string; template: string };
  participants: { role: string; share_bp: number; credits: string | null; snapshot: Snap; status: string; signed_at: string; typed_name: string; method: string; ip: string | null }[];
  sender: { email: string | null; name: string } | null;
  log: { at: string; action: string; detail: Record<string, unknown> | null }[] | null;
};

const LOG: Record<string, string> = {
  created: 'Split creado', sent: 'Cerrado y enviado a firma', approved: 'Aprobado por el espacio que representa',
  link_issued: 'Enlace de firma generado', signed: 'Firmó', completed: 'Firmado por todas las partes', new_version: 'Versión nueva creada',
};

export async function buildFinalPdf(d: FinalDoc) {
  const m: LetterModel = {
    title: d.work.title, artist: d.work.artist || '', version: d.agreement.version, status: 'signed',
    date: d.work.session_date || d.agreement.sent_at.slice(0, 10), template: d.agreement.template || d.workspace.template, workspace: d.workspace.name,
    rows: d.participants.map((p) => rowFrom({ role: p.role, share_bp: p.share_bp, credits: p.credits, snap: p.snapshot,
      sig: { status: p.status, signed_at: p.signed_at, typed_name: p.typed_name, method: p.method, ip: p.ip } })),
    hash: d.agreement.content_sha256, sentAt: d.agreement.sent_at, completedAt: d.agreement.completed_at,
    log: (d.log ?? []).filter((l) => ['created', 'sent', 'approved', 'signed', 'completed', 'new_version'].includes(l.action))
      .map((l) => ({ at: l.at, text: `${LOG[l.action] ?? l.action}${l.action === 'signed' && l.detail?.typed_name ? ` ${l.detail.typed_name}` : ''}` })),
  };
  const pdf = await letterPdf(m, m.template === 'apollo' ? APOLLO_LOGO : null);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const name = `Split ${fileSafe(d.work.title)} v${d.agreement.version} firmado.pdf`;
  return { pdf, bytes, name };
}

// Cuando firma el último: el PDF con todas las firmas a cada firmante y a quien mandó el split
export async function sendFinalDocument(data: unknown) {
  if (!mailConfigured() || !data) return;
  const d = data as FinalDoc;
  const { bytes, name } = await buildFinalPdf(d);
  const b64 = Buffer.from(bytes).toString('base64');
  const lines = d.participants.map((p) => `${p.snapshot.legal_name} · ${ROLE_EN[p.role] ?? p.role} · ${(p.share_bp / 100).toFixed(2).replace(/\.00$/, '')} %`);
  const seen = new Set<string>();
  const to = [
    ...d.participants.map((p) => ({ email: p.snapshot.email ?? '', name: p.snapshot.legal_name ?? '', signer: true })),
    ...(d.sender?.email ? [{ email: d.sender.email, name: d.sender.name, signer: false }] : []),
  ].filter((x) => x.email && !seen.has(x.email.toLowerCase()) && seen.add(x.email.toLowerCase()));
  for (const r of to) {
    const intro = r.signer
      ? `todas las partes firmaron el split de “${d.work.title}” (${d.workspace.name}, versión ${d.agreement.version}).`
      : `el split de “${d.work.title}” que enviaste desde ${d.workspace.name} (versión ${d.agreement.version}) ya está firmado por todas las partes.`;
    await sendMail({
      to: [{ email: r.email, name: r.name || undefined }],
      subject: `Split firmado: “${d.work.title}”`,
      text: `Hola${r.name ? ` ${r.name}` : ''}:\n\n${intro[0].toUpperCase() + intro.slice(1)}\n\n${lines.join('\n')}\n\nTe adjuntamos el documento con todas las firmas y su constancia. Guárdalo: es tu original.\nHuella SHA-256: ${d.agreement.content_sha256}\n\nCleared`,
      html: mailHtml('Split firmado por todas las partes', `<p style="margin:0 0 12px;line-height:1.5">Hola${r.name ? ` ${esc(r.name)}` : ''}, ${esc(intro)}</p>
<ul style="padding-left:18px;margin:0 0 12px;line-height:1.6">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p style="margin:0 0 12px;line-height:1.5">Te adjuntamos el documento con todas las firmas y su constancia. Guárdalo: es tu original.</p>
<p style="margin:0;font-size:11px;color:#777;word-break:break-all">Huella SHA-256: ${esc(d.agreement.content_sha256)}</p>`),
      attachments: [{ filename: name, content: b64, mimeType: 'application/pdf' }],
    });
  }
}
