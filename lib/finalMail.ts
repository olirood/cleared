// Split firmado: los dos PDF finales (carta y constancia), su envío por correo y su archivo en el almacén
import { ROLE_EN, ROLES as ROLE_ES } from './splits';
import { P, esc, firstName, mailBox, mailConfigured, mailHtml, mailWriters, sendMail } from './mail';
import { certificatePdf, fileSafe, fmtStamp, letterPdf, rowFrom, type LetterModel } from './letter';
import type { Lang } from './aviso';
import { APOLLO_LOGO } from './apolloLogo';

type Snap = { legal_name?: string; credit_name?: string; publisher?: string; pro?: string; ipi?: string; email?: string; phone?: string };
export type FinalDoc = {
  agreement: { id: string; version: number; status: string; template: string | null; sent_at: string; completed_at: string; content_sha256: string; language?: string | null };
  work: { id: string; title: string; artist: string | null; session_date: string | null }; workspace: { id: string; name: string; template: string };
  participants: { role: string; share_bp: number; credits: string | null; snapshot: Snap; status: string; signed_at: string; typed_name: string; method: string; ip: string | null; signature_png?: string | null; consent_version?: string | null }[];
  sender: { email: string | null; name: string } | null;
  approvers?: { email: string | null; name: string; workspace: string }[];
  log: { at: string; action: string; detail: Record<string, unknown> | null }[] | null;
};

const LOG: Record<Lang, Record<string, string>> = {
  es: { created: 'Split creado', sent: 'Cerrado y enviado a firma', approved: 'Aprobado por el espacio que representa', signed: 'Firmó', completed: 'Firmado por todas las partes', new_version: 'Versión nueva creada' },
  en: { created: 'Split created', sent: 'Closed and sent for signature', approved: 'Approved by the representing workspace', signed: 'Signed by', completed: 'Signed by all parties', new_version: 'New version created' },
};

export const letterLang = (d: { agreement: { language?: string | null } }): Lang => (d.agreement.language === 'es' ? 'es' : 'en');

// Los dos documentos: la carta (para mandar a terceros) y la constancia (evidencia de firma)
export async function buildFinalPdfs(d: FinalDoc) {
  const lang = letterLang(d);
  const m: LetterModel = {
    title: d.work.title, artist: d.work.artist || '', version: d.agreement.version, status: 'signed', lang,
    date: d.work.session_date || d.agreement.sent_at.slice(0, 10), template: d.agreement.template || d.workspace.template, workspace: d.workspace.name,
    rows: d.participants.map((p) => rowFrom({ role: p.role, share_bp: p.share_bp, credits: p.credits, snap: p.snapshot,
      sig: { status: p.status, signed_at: p.signed_at, typed_name: p.typed_name, method: p.method, ip: p.ip, signature_png: p.signature_png, consent_version: p.consent_version } }, lang)),
    hash: d.agreement.content_sha256, sentAt: d.agreement.sent_at, completedAt: d.agreement.completed_at,
    log: (d.log ?? []).filter((l) => ['created', 'sent', 'approved', 'signed', 'completed', 'new_version'].includes(l.action))
      .map((l) => ({ at: l.at, text: `${LOG[lang][l.action] ?? l.action}${l.action === 'signed' && l.detail?.typed_name ? ` ${l.detail.typed_name}` : ''}` })),
  };
  const [letter, cert] = await Promise.all([letterPdf(m, m.template === 'apollo' ? APOLLO_LOGO : null), certificatePdf(m)]);
  const base = `${fileSafe(d.work.title)} v${d.agreement.version}`;
  return {
    letter: { bytes: new Uint8Array(await letter.arrayBuffer()), name: lang === 'es' ? `Split ${base} firmado.pdf` : `Split ${base} signed.pdf` },
    cert: { bytes: new Uint8Array(await cert.arrayBuffer()), name: lang === 'es' ? `Constancia de firma ${base}.pdf` : `Signing certificate ${base}.pdf` },
  };
}
// compatibilidad: solo la carta
export async function buildFinalPdf(d: FinalDoc) { const { letter } = await buildFinalPdfs(d); return { bytes: letter.bytes, name: letter.name }; }

const M = {
  es: {
    subject: (t: string) => `Split firmado: “${t}”`, title: 'Split firmado ✓', hi: 'Hola',
    signer: (t: string) => `todas las partes firmaron el split de <b style="color:#111114">“${t}”</b>.`,
    approver: (t: string, w: string) => `el split de <b style="color:#111114">“${t}”</b> que aprobaste por ${w} ya está firmado por todas las partes.`,
    sender: (t: string) => `el split de <b style="color:#111114">“${t}”</b> que enviaste ya está firmado por todas las partes.`,
    version: 'versión', letterNote: 'La carta con todas las firmas. Es la que se manda a disqueras, editoras y sociedades.',
    certNote: 'Constancia de firma: cómo firmó cada quien, bitácora y el aviso aceptado. Guárdala junto a la carta.',
    keep: 'Te adjuntamos la carta con todas las firmas y la constancia de firma. Guárdalas: son tu original.',
    hash: 'Huella SHA-256', pre: (t: string) => `Todas las partes firmaron “${t}”. Van adjuntas la carta y la constancia.`,
    foot: undefined as string | undefined,
  },
  en: {
    subject: (t: string) => `Split signed: “${t}”`, title: 'Split signed ✓', hi: 'Hi',
    signer: (t: string) => `all parties have signed the split for <b style="color:#111114">“${t}”</b>.`,
    approver: (t: string, w: string) => `the split for <b style="color:#111114">“${t}”</b> that you approved for ${w} has been signed by all parties.`,
    sender: (t: string) => `the split for <b style="color:#111114">“${t}”</b> that you sent has been signed by all parties.`,
    version: 'version', letterNote: 'The letter with every signature. This is the one you send to labels, publishers and PROs.',
    certNote: 'Signing certificate: how each person signed, the activity log and the accepted notice. Keep it with the letter.',
    keep: 'Attached are the letter with every signature and the signing certificate. Keep them: they are your originals.',
    hash: 'SHA-256 fingerprint', pre: (t: string) => `All parties signed “${t}”. The letter and the signing certificate are attached.`,
    foot: 'Cleared · splits, label copy and signatures.<br>If you weren’t expecting this email, you can ignore it.',
  },
};

const fileBox = (name: string, note: string) => mailBox(`<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:34px;height:42px;background:#ffffff;border:1px solid #dadade;border-radius:6px;text-align:center;font-size:9px;font-weight:700;color:#c2382a;font-family:Helvetica,Arial,sans-serif">PDF</td>
<td style="padding-left:12px;font-size:14px;line-height:1.4;color:#111114"><b>${esc(name)}</b><br><span style="font-size:12.5px;color:#707078">${esc(note)}</span></td></tr></table>`, 'padding:12px 16px;');

// Cuando firma el último: carta y constancia a cada firmante, a quien envió y a quien aprobó
export async function sendFinalDocument(data: unknown) {
  if (!mailConfigured() || !data) return;
  const d = data as FinalDoc;
  const { letter, cert } = await buildFinalPdfs(d);
  const files = [
    { filename: letter.name, content: Buffer.from(letter.bytes).toString('base64'), mimeType: 'application/pdf' },
    { filename: cert.name, content: Buffer.from(cert.bytes).toString('base64'), mimeType: 'application/pdf' },
  ];
  const seen = new Set<string>();
  // a cada firmante en el idioma en que firmó; a quien envió o aprobó, en español
  const to = [
    ...d.participants.map((p) => ({ email: p.snapshot.email ?? '', name: p.snapshot.legal_name ?? '', kind: 'signer' as const, lang: (p.consent_version?.endsWith('-en') ? 'en' : 'es') as Lang, ws: '' })),
    ...(d.sender?.email ? [{ email: d.sender.email, name: d.sender.name, kind: 'sender' as const, lang: 'es' as Lang, ws: '' }] : []),
    ...(d.approvers ?? []).filter((a) => a.email).map((a) => ({ email: a.email!, name: a.name, kind: 'approver' as const, lang: 'es' as Lang, ws: a.workspace })),
  ].filter((x) => x.email && !seen.has(x.email.toLowerCase()) && seen.add(x.email.toLowerCase()));
  const pct = (bp: number) => (bp / 100).toFixed(2).replace(/\.00$/, '');
  for (const r of to) {
    const t = M[r.lang], title = esc(d.work.title);
    const writers = d.participants.map((p) => ({ name: p.snapshot.legal_name ?? '', role: r.lang === 'es' ? (ROLE_ES as Record<string, string>)[p.role] ?? p.role : ROLE_EN[p.role] ?? p.role, pct: pct(p.share_bp) }));
    const hi = firstName(r.name);
    const intro = r.kind === 'signer' ? t.signer(title) : r.kind === 'approver' ? t.approver(title, esc(r.ws)) : t.sender(title);
    const plain = intro.replace(/<[^>]+>/g, '');
    const when = fmtStamp(d.agreement.completed_at, r.lang);
    await sendMail({
      to: [{ email: r.email, name: r.name || undefined }],
      subject: t.subject(d.work.title),
      text: `${t.hi}${hi ? ` ${hi}` : ''}:\n\n${plain[0].toUpperCase() + plain.slice(1)}\n${d.workspace.name} · ${t.version} ${d.agreement.version} · ${when}\n\n${writers.map((w) => `${w.name} · ${w.role} · ${w.pct} %`).join('\n')}\n\n${t.keep}\n${t.hash}: ${d.agreement.content_sha256}\n\nCleared`,
      html: mailHtml(t.title,
        P(`${t.hi}${hi ? ` ${esc(hi)}` : ''}, ${intro}`)
        + P(`${esc(d.workspace.name)} · ${t.version} ${d.agreement.version} · ${esc(when)}`, 'font-size:13px;color:#707078;margin-top:-6px;')
        + mailWriters(writers)
        + fileBox(letter.name, t.letterNote)
        + fileBox(cert.name, t.certNote)
        + `<p style="margin:0;font-size:11px;line-height:1.5;color:#8a8a92;word-break:break-all">${t.hash}: ${esc(d.agreement.content_sha256)}</p>`,
        { preheader: t.pre(d.work.title), ...(t.foot ? { foot: t.foot } : {}) }),
      attachments: files,
    });
  }
}
