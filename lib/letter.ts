// Carta de split: el mismo modelo arma la vista en pantalla y el PDF
import { ROLE_EN, fmtPct, fmtDateTime } from './splits';

export const LETTER = {
  title: 'Songwriters’ Split Letter',
  salutation: 'To Whom It May Concern:',
  intro: 'This letter shall confirm the understanding between the songwriters listed below as to the division of ownership interest in the Composition (as defined below):',
  splitsLead: 'Each songwriter hereunder agrees that the ownership interest in the Composition shall be divided as follows:',
  originality: 'Each songwriter individually and only with respect to his/her respective contribution and ownership interest in the Composition hereby certifies that all materials provided by him/ her are entirely original, do not contain any so-called “samples” and otherwise do not infringe the rights (including copyright) of any third party.',
  warranties: 'Each songwriter warrants and represents that he/she is free to enter into this agreement and has no restriction, contractual or otherwise, that would impede him/her from doing so. Each songwriter further represents that the information, understanding and representations contained in this agreement are correct and accurate and agrees to indemnify and hold harmless his/her co-songwriters hereunder from any third party claim that arises out of a breach or misrepresentation of any warranty and/or representation contained herein.',
  counterparts: 'This agreement may be executed in counterparts, and facsimile and photocopied signatures of this agreement shall be treated as originals for all purposes relating to this agreement.',
  confirm: 'Please confirm your agreement with the foregoing by arranging the signatures where indicated below.',
  accepted: 'READ, AGREED TO AND ACCEPTED:',
};
export const COLS = ['Full Legal Name', 'Artist Name', 'Role', '%', 'Publishing Designee', 'PRO', 'CREDITS'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtEn(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return isNaN(+d) ? iso : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export type LetterRow = {
  name: string; artist: string; role: string; pct: string; publisher: string; pro: string; ipi: string; credits: string;
  signed: boolean; signedAt: string | null; typedName: string | null; method: string | null; ip: string | null; contact: string;
};
export type LetterModel = {
  title: string; artist: string; version: number; status: string; date: string; template: string; workspace: string;
  rows: LetterRow[]; hash: string | null; sentAt: string | null; completedAt: string | null; log: { at: string; text: string }[];
};

export function rowFrom(p: {
  role: string; share_bp: number; credits: string | null;
  snap: { legal_name?: string | null; credit_name?: string | null; publisher?: string | null; pro?: string | null; ipi?: string | null; email?: string | null; phone?: string | null };
  sig?: { status?: string; signed_at?: string | null; typed_name?: string | null; method?: string | null; ip?: string | null } | null;
}): LetterRow {
  const s = p.snap;
  return {
    name: s.legal_name || '', artist: s.credit_name || '', role: ROLE_EN[p.role] || p.role, pct: fmtPct(p.share_bp),
    publisher: s.publisher || 'N/A', pro: s.pro || '', ipi: s.ipi || '', credits: p.credits || '',
    signed: p.sig?.status === 'signed', signedAt: p.sig?.signed_at ?? null, typedName: p.sig?.typed_name ?? null,
    method: p.sig?.method ?? null, ip: p.sig?.ip ?? null, contact: s.phone || s.email || '',
  };
}

async function logoData(): Promise<string | null> {
  try {
    const blob = await (await fetch('/apollo-logo.png')).blob();
    return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
  } catch { return null; }
}

export async function letterPdf(m: LetterModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 72, CW = W - 2 * M;
  let y = 72;
  const ensure = (h: number) => { if (y + h > H - 70) { doc.addPage(); y = 72; return true; } return false; };
  type Seg = [string, 'normal' | 'bold' | 'italic' | 'bolditalic'];
  const rich = (segs: Seg[], size = 11, gapAfter = 9, font = 'times') => {
    doc.setFontSize(size); const lh = size * 1.3;
    const words: Seg[] = [];
    segs.forEach(([txt, st]) => String(txt).split(/(\s+)/).forEach((w) => { if (w) words.push([/^\s+$/.test(w) ? ' ' : w, st]); }));
    let line: Seg[] = [], lw = 0;
    const flush = () => { ensure(lh); let x = M; line.forEach(([w, st]) => { doc.setFont(font, st); doc.text(w, x, y); x += doc.getTextWidth(w); }); y += lh; line = []; lw = 0; };
    words.forEach(([w, st]) => {
      doc.setFont(font, st); const ww = doc.getTextWidth(w);
      if (w === ' ') { if (line.length) { line.push([w, st]); lw += ww; } return; }
      if (lw + ww > CW && line.length) { while (line.length && line[line.length - 1][0] === ' ') line.pop(); flush(); }
      line.push([w, st]); lw += ww;
    });
    if (line.length) flush();
    y += gapAfter;
  };

  // membrete
  const logoW = 150, logoH = logoW * (326 / 760);
  const logo = m.template === 'apollo' ? await logoData() : null;
  if (logo) doc.addImage(logo, 'PNG', (W - logoW) / 2, 44, logoW, logoH);
  else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setCharSpace(2);
    doc.text(m.workspace.toUpperCase(), W / 2, 44 + logoH / 2 + 4, { align: 'center' }); doc.setCharSpace(0);
  }
  y = 44 + logoH + 34;
  doc.setFont('times', 'bold'); doc.setFontSize(13);
  doc.text(LETTER.title, W / 2, y, { align: 'center' });
  const tw = doc.getTextWidth(LETTER.title); doc.setLineWidth(0.7); doc.line(W / 2 - tw / 2, y + 2.5, W / 2 + tw / 2, y + 2.5);
  y += 32;
  rich([['Date:', 'bold'], [' ' + fmtEn(m.date), 'normal']], 11, 12);
  rich([[LETTER.salutation, 'normal']], 11, 9);
  rich([[LETTER.intro, 'normal']], 11, 22);
  rich([['Song Title(s):', 'bold'], [' ', 'normal'], [`“${m.title}”`, 'bolditalic'], [' of the artists or band professionally known as ', 'normal'], [(m.artist || '—') + '.', 'bold']], 11, 20);
  rich([['Writers & Splits:', 'bold'], [' ' + LETTER.splitsLead, 'normal']], 11, 18);

  // tabla
  const widths = [92, 52, 64, 36, 86, 70, 68];
  const xs = widths.reduce<number[]>((a, _w, i) => (a.push(i ? a[i - 1] + widths[i - 1] : M), a), []);
  const head = () => {
    const hh = 34; ensure(hh);
    doc.setDrawColor(160); doc.setLineWidth(0.6); doc.setFont('times', 'bold'); doc.setFontSize(9);
    COLS.forEach((c, i) => {
      doc.rect(xs[i], y, widths[i], hh);
      const ls = doc.splitTextToSize(c, widths[i] - 8) as string[];
      ls.forEach((l, k) => doc.text(l, xs[i] + widths[i] / 2, y + hh / 2 + 3 - (ls.length - 1) * 5 + k * 10, { align: 'center' }));
    });
    y += hh;
  };
  head();
  doc.setFont('times', 'normal'); doc.setFontSize(9);
  m.rows.forEach((r) => {
    const cells = [r.name, r.artist, r.role, r.pct, r.publisher, r.pro + (r.ipi ? '\nIPI ' + r.ipi : ''), r.credits]
      .map((v, i) => doc.splitTextToSize(String(v || ''), widths[i] - 8) as string[]);
    const rh = Math.max(28, Math.max(...cells.map((c) => c.length)) * 10.5 + 12);
    if (ensure(rh)) { head(); doc.setFont('times', 'normal'); doc.setFontSize(9); }
    cells.forEach((c, i) => { doc.rect(xs[i], y, widths[i], rh); doc.text(c, i === 3 ? xs[i] + widths[i] / 2 : xs[i] + 4, y + 15, i === 3 ? { align: 'center' } : undefined); });
    y += rh;
  });
  y += 24;
  rich([['Originality of Contribution', 'bold'], [': ' + LETTER.originality, 'normal']], 10.5, 10);
  rich([['Warranties & Representations', 'bold'], [': ' + LETTER.warranties, 'normal']], 10.5, 10);
  rich([[LETTER.counterparts, 'normal']], 10.5, 10);
  rich([[LETTER.confirm, 'normal']], 10.5, 24);
  rich([[LETTER.accepted, 'bold']], 10.5, 34);

  // firmas, dos por renglón como la plantilla
  const colW = 190, gapX = CW - 2 * colW;
  for (let i = 0; i < m.rows.length; i += 2) {
    ensure(84);
    [m.rows[i], m.rows[i + 1]].forEach((r, k) => {
      if (!r) return;
      const x = M + k * (colW + gapX);
      if (r.signed) { doc.setFont('times', 'italic'); doc.setFontSize(15); doc.setTextColor(20, 20, 20); doc.text(r.typedName || r.name, x + 4, y - 6, { maxWidth: colW - 8 }); }
      doc.setDrawColor(40); doc.setLineWidth(0.6); doc.line(x, y, x + colW, y);
      doc.setTextColor(0, 0, 0); doc.setFont('times', 'normal'); doc.setFontSize(9.5); doc.text(r.name, x, y + 13, { maxWidth: colW });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(95, 95, 100);
      if (r.signed) doc.text(`Firmado electrónicamente · ${fmtDateTime(r.signedAt)}`, x, y + 25);
      else if (m.status !== 'draft') doc.text('Pendiente de firma', x, y + 25);
      doc.setTextColor(0, 0, 0);
    });
    y += 84;
  }

  // anexo: constancia de firma electrónica
  doc.addPage(); y = 72;
  const H2 = (txt: string) => { ensure(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.text(txt, M, y); y += 18; };
  const kv = (k: string, v: string) => {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(95, 95, 100); ensure(13); doc.text(k, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
    const ls = doc.splitTextToSize(String(v), CW - 130) as string[]; doc.text(ls, M + 130, y); y += Math.max(1, ls.length) * 11 + 3;
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(0, 0, 0); doc.text('Constancia de firma electrónica', M, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(95, 95, 100); doc.text('Electronic signature certificate · Anexo de la carta anterior', M, y); y += 26;
  H2('Documento');
  kv('Documento', `${LETTER.title}, ${m.workspace}`);
  kv('Obra', `“${m.title}”${m.artist ? `, ${m.artist}` : ''}`);
  kv('Versión', `v${m.version}`);
  kv('Estado', m.status === 'signed' ? 'Firmado por todas las partes' : m.status === 'sent' ? 'En proceso de firma' : m.status === 'void' ? 'Versión anulada' : 'Borrador');
  if (m.sentAt) kv('Cerrado y enviado', fmtDateTime(m.sentAt) + ' (hora de CDMX)');
  if (m.completedAt) kv('Completado', fmtDateTime(m.completedAt) + ' (hora de CDMX)');
  kv('Huella SHA-256', m.hash || 'Se calcula al cerrar el documento');
  kv('Constancia NOM-151', 'No emitida. Firma electrónica simple con enlace único por firmante.');
  y += 10;
  H2('Firmantes');
  m.rows.forEach((r) => {
    ensure(70);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0); doc.text(r.name, M, y); y += 13;
    kv('Estado', r.signed ? `Firmado · ${fmtDateTime(r.signedAt)} (hora de CDMX)` : m.status === 'draft' ? 'Sin enviar' : 'Pendiente');
    if (r.signed) {
      kv('Método', r.method || 'Enlace único');
      kv('Nombre escrito', r.typedName || '');
      if (r.ip) kv('Dirección IP', r.ip);
      kv('Consentimiento', 'Aceptó firmar por medios electrónicos (Código de Comercio, arts. 89 a 93).');
    }
    y += 6;
  });
  if (m.log.length) {
    y += 6; H2('Bitácora');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    m.log.forEach((l) => {
      const ls = doc.splitTextToSize(l.text, CW - 120) as string[]; ensure(ls.length * 10 + 3);
      doc.setTextColor(95, 95, 100); doc.text(fmtDateTime(l.at), M, y); doc.setTextColor(20, 20, 20); doc.text(ls, M + 120, y); y += ls.length * 10 + 3;
    });
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(130, 130, 136);
    doc.text(`Cleared · ${m.hash ? 'SHA-256 ' + m.hash.slice(0, 20) + '…' : 'Borrador sin cerrar'} · Página ${i} de ${n}`, W / 2, H - 34, { align: 'center' });
  }
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, ' ') || 'split';
