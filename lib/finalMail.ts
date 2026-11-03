// Split firmado: el PDF final (servidor), su envío por correo y su archivo en el almacén
import { ROLE_EN, ROLES as ROLE_ES, fmtDateTime } from './splits';
import { P, esc, firstName, mailBox, mailConfigured, mailHtml, mailWriters, sendMail } from './mail';
import { fileSafe, letterPdf, rowFrom, type LetterModel } from './letter';
import { APOLLO_LOGO } from './apolloLogo';

type Snap = { legal_name?: string; credit_name?: string; publisher?: string; pro?: string; ipi?: string; email?: string; phone?: string };
export type FinalDoc = {
  agreement: { id: string; version: number; status: string; template: string | null; sent_at: string; completed_at: string; content_sha256: string };
  work: { id: string; title: string; artist: string | null; session_date: string | null }; workspace: { id: string; name: string; template: string };
  participants: { role: string; share_bp: number; credits: string | null; snapshot: Snap; status: string; signed_at: string; typed_name: string; method: string; ip: string | null }[];
  sender: { email: string | null; name: string } | null;
  approvers?: { email: string | null; name: string; workspace: string }[];
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
    ...(d.approvers ?? []).filter((a) => a.email).map((a) => ({ email: a.email!, name: a.name, signer: false, approver: a.workspace })),
  ].filter((x) => x.email && !seen.has(x.email.toLowerCase()) && seen.add(x.email.toLowerCase()));
  const writers = d.participants.map((p) => ({ name: p.snapshot.legal_name ?? '', role: (ROLE_ES as Record<string, string>)[p.role] ?? p.role, pct: (p.share_bp / 100).toFixed(2).replace(/\.00$/, '') }));
  const when = fmtDateTime(d.agreement.completed_at);
  for (const r of to) {
    const hola = firstName(r.name);
    const intro = r.signer
      ? `todas las partes firmaron el split de <b style="color:#111114">“${esc(d.work.title)}”</b>.`
      : 'approver' in r && r.approver
        ? `el split de <b style="color:#111114">“${esc(d.work.title)}”</b> que aprobaste por ${esc(String(r.approver))} ya está firmado por todas las partes.`
        : `el split de <b style="color:#111114">“${esc(d.work.title)}”</b> que enviaste ya está firmado por todas las partes.`;
    const plain = intro.replace(/<[^>]+>/g, '');
    await sendMail({
      to: [{ email: r.email, name: r.name || undefined }],
      subject: `Split firmado: “${d.work.title}”`,
      text: `Hola${hola ? ` ${hola}` : ''}:\n\n${plain[0].toUpperCase() + plain.slice(1)}\n${d.workspace.name} · versión ${d.agreement.version} · ${when}\n\n${lines.join('\n')}\n\nTe adjuntamos el documento con todas las firmas y su constancia. Guárdalo: es tu original.\nHuella SHA-256: ${d.agreement.content_sha256}\n\nCleared`,
      html: mailHtml('Split firmado ✓',
        P(`Hola${hola ? ` ${esc(hola)}` : ''}, ${intro}`)
        + P(`${esc(d.workspace.name)} · versión ${d.agreement.version} · ${esc(when)}`, 'font-size:13px;color:#707078;margin-top:-6px;')
        + mailWriters(writers)
        + mailBox(`<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:34px;height:42px;background:#ffffff;border:1px solid #dadade;border-radius:6px;text-align:center;font-size:9px;font-weight:700;color:#c2382a;font-family:Helvetica,Arial,sans-serif">PDF</td>
<td style="padding-left:12px;font-size:14px;line-height:1.4;color:#111114"><b>${esc(name)}</b><br><span style="font-size:12.5px;color:#707078">Va adjunto: carta con todas las firmas y constancia de firma electrónica. Guárdalo, es tu original.</span></td></tr></table>`)
        + `<p style="margin:0;font-size:11px;line-height:1.5;color:#8a8a92;word-break:break-all">Huella SHA-256: ${esc(d.agreement.content_sha256)}</p>`,
        { preheader: `Todas las partes firmaron “${d.work.title}”. Va adjunto el PDF con las firmas.` }),
      attachments: [{ filename: name, content: b64, mimeType: 'application/pdf' }],
    });
  }
}
