// Carta de split: el mismo modelo arma la vista en pantalla y el PDF
import { ROLE_EN, fmtPct, fmtDateTime } from './splits';
import { AVISO_CONFIRM, AVISO_LABEL, AVISO_TITLE, AVISO_V, avisoSections } from './aviso';

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
// Columnas de la tabla de autores (pantalla y PDF)
export const COLS = ['Full legal name', 'Role', 'Publishing designee', 'PRO · IPI', 'Share'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtEn(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return isNaN(+d) ? iso : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export type LetterRow = {
  name: string; artist: string; role: string; pct: string; publisher: string; pro: string; ipi: string; credits: string;
  signed: boolean; signedAt: string | null; typedName: string | null; method: string | null; ip: string | null; contact: string;
  sigImage: string | null;   // firma dibujada (PNG), si la dibujó
  consent: string | null;    // versión del aviso que aceptó
};
export type LetterModel = {
  title: string; artist: string; version: number; status: string; date: string; template: string; workspace: string;
  rows: LetterRow[]; hash: string | null; sentAt: string | null; completedAt: string | null; log: { at: string; text: string }[];
};

// la carta va en inglés: las opciones en español del perfil se traducen
const PRO_EN: Record<string, string> = { Ninguna: 'None', Otra: 'Other' };

export function rowFrom(p: {
  role: string; share_bp: number; credits: string | null;
  snap: { legal_name?: string | null; credit_name?: string | null; publisher?: string | null; pro?: string | null; ipi?: string | null; email?: string | null; phone?: string | null };
  sig?: { status?: string; signed_at?: string | null; typed_name?: string | null; method?: string | null; ip?: string | null; signature_png?: string | null; consent_version?: string | null } | null;
}): LetterRow {
  const s = p.snap;
  return {
    name: s.legal_name || '', artist: s.credit_name || '', role: ROLE_EN[p.role] || p.role, pct: fmtPct(p.share_bp),
    publisher: s.publisher || 'N/A', pro: PRO_EN[s.pro || ''] ?? (s.pro || ''), ipi: s.ipi || '', credits: p.credits || '',
    signed: p.sig?.status === 'signed', signedAt: p.sig?.signed_at ?? null, typedName: p.sig?.typed_name ?? null,
    method: p.sig?.method ?? null, ip: p.sig?.ip ?? null, contact: s.phone || s.email || '',
    sigImage: p.sig?.status === 'signed' && p.sig?.signature_png?.startsWith('data:image/png;base64,') ? p.sig.signature_png : null,
    consent: p.sig?.status === 'signed' ? p.sig?.consent_version ?? null : null,
  };
}

async function logoData(): Promise<string | null> {
  try {
    const blob = await (await fetch('/apollo-logo.png')).blob();
    return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
  } catch { return null; }
}

// Colores del documento (RGB)
const INK: [number, number, number] = [17, 17, 20];
const BODY: [number, number, number] = [52, 52, 58];
const MUTED: [number, number, number] = [112, 112, 120];
const RULE: [number, number, number] = [218, 218, 222];
const TINT: [number, number, number] = [244, 244, 246];
const OK: [number, number, number] = [30, 120, 70];

export async function letterPdf(m: LetterModel, logoOverride?: string | null): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { SIG_FONT } = await import('./sigFont');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  doc.addFileToVFS('Parisienne.ttf', SIG_FONT);
  doc.addFont('Parisienne.ttf', 'Parisienne', 'normal');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 64, CW = W - 2 * M, TOP = 60, BOTTOM = H - 58;
  let y = TOP;
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (st: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number, c: [number, number, number] = BODY, family = 'helvetica') => { doc.setFont(family, st); doc.setFontSize(size); color(c); };
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h: number) => { if (y + h > BOTTOM) { newPage(); return true; } return false; };

  // párrafo con negritas/itálicas dentro; measure=true solo calcula la altura
  type Seg = [string, 'normal' | 'bold' | 'italic' | 'bolditalic'];
  const para = (segs: Seg[], o: { size?: number; gap?: number; c?: [number, number, number]; measure?: boolean } = {}) => {
    const size = o.size ?? 9.6, lh = size * 1.5, gap = o.gap ?? 9;
    doc.setFontSize(size);
    const words: Seg[] = [];
    segs.forEach(([txt, st]) => String(txt).split(/(\s+)/).forEach((w) => { if (w) words.push([/^\s+$/.test(w) ? ' ' : w, st]); }));
    const lines: Seg[][] = []; let line: Seg[] = [], lw = 0;
    words.forEach(([w, st]) => {
      doc.setFont('helvetica', st); const ww = doc.getTextWidth(w);
      if (w === ' ') { if (line.length) { line.push([w, st]); lw += ww; } return; }
      if (lw + ww > CW && line.length) { while (line.length && line[line.length - 1][0] === ' ') line.pop(); lines.push(line); line = []; lw = 0; }
      line.push([w, st]); lw += ww;
    });
    if (line.length) lines.push(line);
    const h = lines.length * lh + gap;
    if (o.measure) return h;
    lines.forEach((ln) => {
      ensure(lh);
      let x = M;
      ln.forEach(([w, st]) => { font(st, size, st.startsWith('bold') ? INK : (o.c ?? BODY)); doc.text(w, x, y + size); x += doc.getTextWidth(w); });
      y += lh;
    });
    y += gap;
    return h;
  };

  // ---------- membrete ----------
  const logo = m.template === 'apollo' ? (logoOverride !== undefined ? logoOverride : await logoData()) : null;
  if (logo) {
    const lw = 116, lh = lw * (326 / 760);
    doc.addImage(logo, 'PNG', M, y - 6, lw, lh, 'apollo-logo', 'FAST');
    y += lh - 6;
  } else {
    font('bold', 10.5, INK); doc.setCharSpace(1.6);
    doc.text(m.workspace.toUpperCase(), M, y + 10); doc.setCharSpace(0);
    y += 18;
  }
  font('normal', 8, MUTED);
  const stateTxt = m.status === 'signed' ? 'Signed by all parties' : m.status === 'sent' ? 'Out for signature' : m.status === 'void' ? 'Void' : 'Draft';
  doc.text(`Version ${m.version} · ${stateTxt}`, W - M, TOP + 10, { align: 'right' });
  y += 12;
  doc.setDrawColor(...RULE); doc.setLineWidth(0.8); doc.line(M, y, W - M, y);
  y += 22;

  font('bold', 20, INK); doc.text(LETTER.title, M, y + 4); y += 18;
  font('normal', 9.5, MUTED); doc.text(fmtEn(m.date), M, y + 9); y += 22;

  para([[LETTER.salutation, 'normal']], { gap: 6 });
  para([[LETTER.intro, 'normal']], { gap: 10 });
  para([['Song Title(s):', 'bold'], [' ', 'normal'], [`“${m.title}”`, 'bolditalic'], [' of the artists or band professionally known as ', 'normal'], [(m.artist || '—') + '.', 'bold']], { gap: 10 });
  para([['Writers & Splits:', 'bold'], [' ' + LETTER.splitsLead, 'normal']], { gap: 12 });

  // ---------- tabla de autores ----------
  const widths = [170, 82, 100, 80, 52];   // suman el ancho útil (484)
  const xs = widths.reduce<number[]>((a, _w, i) => (a.push(i ? a[i - 1] + widths[i - 1] : M), a), []);
  const PADX = 8;
  const head = () => {
    const hh = 24; ensure(hh + 40);
    doc.setFillColor(...TINT); doc.roundedRect(M, y, CW, hh, 4, 4, 'F');
    font('bold', 7, MUTED); doc.setCharSpace(0.5);
    COLS.forEach((c, i) => {
      const t = c.toUpperCase();
      if (i === COLS.length - 1) doc.text(t, xs[i] + widths[i] - PADX, y + 15, { align: 'right' });
      else doc.text(t, xs[i] + PADX, y + 15);
    });
    doc.setCharSpace(0);
    y += hh;
  };
  head();
  m.rows.forEach((r, idx) => {
    font('bold', 9, INK);
    const nameL = doc.splitTextToSize(r.name, widths[0] - 2 * PADX) as string[];
    font('normal', 8, MUTED);
    const subL = [
      ...(r.artist ? doc.splitTextToSize(r.artist, widths[0] - 2 * PADX) as string[] : []),
      ...(r.credits ? doc.splitTextToSize(`Credits: ${r.credits}`, widths[0] - 2 * PADX) as string[] : []),
    ];
    font('normal', 9, BODY);
    const roleL = doc.splitTextToSize(r.role, widths[1] - 2 * PADX) as string[];
    const pubL = doc.splitTextToSize(r.publisher, widths[2] - 2 * PADX) as string[];
    const proL = [r.pro || '—', ...(r.ipi ? [`IPI ${r.ipi}`] : [])];
    const rh = Math.max(nameL.length * 11.5 + subL.length * 10.5, roleL.length * 11.5, pubL.length * 11.5, proL.length * 11.5) + 15;
    if (ensure(rh)) head();
    const ty = y + 13;
    font('bold', 9, INK); doc.text(nameL, xs[0] + PADX, ty, { lineHeightFactor: 1.28 });
    if (subL.length) { font('normal', 8, MUTED); doc.text(subL, xs[0] + PADX, ty + nameL.length * 11.5, { lineHeightFactor: 1.3 }); }
    font('normal', 9, BODY);
    doc.text(roleL, xs[1] + PADX, ty, { lineHeightFactor: 1.28 });
    doc.text(pubL, xs[2] + PADX, ty, { lineHeightFactor: 1.28 });
    doc.text(proL[0], xs[3] + PADX, ty);
    if (proL[1]) { font('normal', 8, MUTED); doc.text(proL[1], xs[3] + PADX, ty + 11.5); }
    font('bold', 10, INK); doc.text(`${r.pct}%`, xs[4] + widths[4] - PADX, ty, { align: 'right' });
    y += rh;
    if (idx < m.rows.length - 1) { doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); }
  });
  // total
  const total = m.rows.reduce((t, r) => t + (parseFloat(r.pct) || 0), 0);
  doc.setDrawColor(...INK); doc.setLineWidth(0.8); doc.line(M, y, W - M, y);
  font('bold', 8, MUTED); doc.setCharSpace(0.5); doc.text('TOTAL', M + PADX, y + 15); doc.setCharSpace(0);
  font('bold', 10, INK); doc.text(`${Math.round(total * 100) / 100}%`, W - M - PADX, y + 15, { align: 'right' });
  y += 28;

  // ---------- cláusulas ----------
  para([['Originality of Contribution.', 'bold'], [' ' + LETTER.originality, 'normal']]);
  para([['Warranties & Representations.', 'bold'], [' ' + LETTER.warranties, 'normal']]);
  para([[LETTER.counterparts, 'normal']]);

  // el cierre y las firmas van juntos: si no caben, pasan completos a la hoja siguiente
  const SIG_H = 78, SIG_LAST = 58, SIG_GAP = 36;
  const colW = (CW - SIG_GAP) / 2;
  const sigRows = Math.ceil(m.rows.length / 2);
  const closing = para([[LETTER.confirm, 'normal']], { measure: true, gap: 14 }) + 14 + 20 + (Math.min(sigRows, 2) - 1) * SIG_H + SIG_LAST;
  if (y + closing > BOTTOM) newPage();
  para([[LETTER.confirm, 'normal']], { gap: 14 });
  font('bold', 9.6, INK); doc.text(LETTER.accepted, M, y + 9.6); y += 14 + 20;

  // ---------- firmas ----------
  for (let i = 0; i < m.rows.length; i += 2) {
    ensure(i + 2 >= m.rows.length ? SIG_LAST : SIG_H);
    [m.rows[i], m.rows[i + 1]].forEach((r, k) => {
      if (!r) return;
      const x = M + k * (colW + SIG_GAP);
      const lineY = y + 34;
      if (r.signed && r.sigImage) {
        // firma dibujada: cabe en la caja sobre la línea sin deformarse
        try {
          const ip = doc.getImageProperties(r.sigImage);
          const k = Math.min((colW - 8) / ip.width, 40 / ip.height);
          doc.addImage(r.sigImage, 'PNG', x + 2, lineY - 3 - ip.height * k, ip.width * k, ip.height * k, undefined, 'FAST');
        } catch { /* si la imagen no se puede leer, queda la línea con el nombre */ }
      } else if (r.signed) {
        // la firma escrita en letra manuscrita, más chica si el nombre es largo (nunca en dos renglones)
        const sig = r.typedName || r.name;
        let size = 24;
        doc.setFont('Parisienne', 'normal');
        while (size > 12) { doc.setFontSize(size); if (doc.getTextWidth(sig) <= colW - 8) break; size -= 1; }
        color(INK); doc.text(sig, x + 2, lineY - 7);
      }
      doc.setDrawColor(...INK); doc.setLineWidth(0.7); doc.line(x, lineY, x + colW, lineY);
      font('bold', 8.8, INK); doc.text(doc.splitTextToSize(r.name, colW)[0] as string, x, lineY + 14);
      font('normal', 7.6, r.signed ? OK : MUTED);
      if (r.signed) doc.text(`Signed electronically · ${fmtDateTime(r.signedAt)}`, x, lineY + 26);
      else if (m.status !== 'draft') doc.text('Pending signature', x, lineY + 26);
    });
    y += SIG_H;
  }

  // ---------- anexo: constancia de firma electrónica ----------
  newPage();
  font('bold', 17, INK); doc.text('Constancia de firma electrónica', M, y + 6); y += 20;
  font('normal', 8.5, MUTED); doc.text('Electronic signature certificate · Anexo de la carta de split', M, y + 6); y += 26;

  const kvRows = (rows: [string, string, boolean?][], boxed: boolean) => {
    const keyW = 118, valW = CW - keyW - (boxed ? 28 : 0), x0 = M + (boxed ? 14 : 0);
    const items = rows.map(([k, v, mono]) => {
      doc.setFont(mono ? 'courier' : 'helvetica', 'normal'); doc.setFontSize(mono ? 7.6 : 8.6);
      return { k, v, mono, lines: doc.splitTextToSize(v, valW) as string[] };
    });
    const h = items.reduce((t, it) => t + it.lines.length * 11.5 + 6, 0) + (boxed ? 20 : 0);
    ensure(h);
    if (boxed) { doc.setFillColor(...TINT); doc.roundedRect(M, y, CW, h, 6, 6, 'F'); y += 14; }
    items.forEach((it) => {
      font('normal', 8, MUTED); doc.text(it.k, x0, y + 8);
      if (it.mono) { doc.setFont('courier', 'normal'); doc.setFontSize(7.6); color(INK); }
      else font('normal', 8.6, INK);
      doc.text(it.lines, x0 + keyW, y + 8, { lineHeightFactor: 1.33 });
      y += it.lines.length * 11.5 + 6;
    });
    y += boxed ? 6 : 0;
  };
  const section = (t: string) => { ensure(40); y += 14; font('bold', 7.5, MUTED); doc.setCharSpace(0.8); doc.text(t.toUpperCase(), M, y + 6); doc.setCharSpace(0); y += 16; };

  section('Documento');
  kvRows([
    ['Obra', `“${m.title}”${m.artist ? ` · ${m.artist}` : ''}`],
    ['Documento', `${LETTER.title} · ${m.workspace} · versión ${m.version}`],
    ['Estado', m.status === 'signed' ? 'Firmado por todas las partes' : m.status === 'sent' ? 'En proceso de firma' : m.status === 'void' ? 'Versión anulada' : 'Borrador'],
    ...(m.sentAt ? [['Enviado a firma', `${fmtDateTime(m.sentAt)} (hora de CDMX)`] as [string, string]] : []),
    ...(m.completedAt ? [['Completado', `${fmtDateTime(m.completedAt)} (hora de CDMX)`] as [string, string]] : []),
    ['Huella SHA-256', m.hash || 'Se calcula al cerrar el documento', true],
    ['Tipo de firma', 'Firma electrónica simple con enlace único y código por correo (Código de Comercio, arts. 89 a 93). Sin constancia NOM-151.'],
  ], true);

  section('Firmantes');
  m.rows.forEach((r, i) => {
    const rows: [string, string, boolean?][] = [
      ['Estado', r.signed ? `Firmó · ${fmtDateTime(r.signedAt)} (hora de CDMX)` : m.status === 'draft' ? 'Sin enviar' : 'Pendiente de firma'],
      ...(r.signed ? [
        ['Verificación', r.method || 'Enlace único'] as [string, string],
        ['Nombre escrito', r.typedName || ''] as [string, string],
        ...(r.ip ? [['Dirección IP', r.ip] as [string, string]] : []),
        ['Consentimiento', r.consent === AVISO_V ? `Aceptó el ${AVISO_TITLE} (anexo) y firmar por medios electrónicos.` : 'Aceptó firmar por medios electrónicos.'] as [string, string],
      ] : []),
    ];
    ensure(30 + rows.length * 17);
    if (i) { doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10; }
    font('bold', 9.6, INK); doc.text(r.name, M, y + 9);
    font('bold', 7.5, r.signed ? OK : MUTED); doc.text(r.signed ? 'FIRMADO' : 'PENDIENTE', W - M, y + 9, { align: 'right' });
    y += 18;
    kvRows(rows, false);
    y += 6;
  });

  if (m.log.length) {
    section('Bitácora');
    m.log.forEach((l) => {
      font('normal', 8.4, INK);
      const ls = doc.splitTextToSize(l.text, CW - 130) as string[];
      ensure(ls.length * 11 + 6);
      font('normal', 8, MUTED); doc.text(fmtDateTime(l.at), M, y + 8);
      font('normal', 8.4, INK); doc.text(ls, M + 130, y + 8, { lineHeightFactor: 1.3 });
      y += ls.length * 11 + 6;
    });
  }

  // anexo: el aviso que aceptaron, tal cual
  if (m.rows.some((r) => r.consent === AVISO_V)) {
    newPage();
    font('bold', 17, INK); doc.text(AVISO_TITLE, M, y + 6); y += 20;
    font('normal', 8.5, MUTED); doc.text(`Anexo · ${AVISO_LABEL} · aceptado por quienes firmaron con esta versión`, M, y + 6); y += 26;
    for (const x of avisoSections(m.workspace)) {
      ensure(40);
      font('bold', 10, INK); doc.text(x.h, M, y + 8); y += 16;
      para([[x.p, 'normal']], { size: 9.2, gap: 10 });
    }
    ensure(30); font('bold', 10, INK); doc.text('Al aceptar confirmaron que', M, y + 8); y += 16;
    for (const c of AVISO_CONFIRM) para([['•  ' + c, 'normal']], { size: 9.2, gap: 2 });
  }

  // pie de página
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
    font('normal', 6.8, MUTED);
    doc.text(`Cleared · ${m.title} · v${m.version}${m.hash ? ` · SHA-256 ${m.hash.slice(0, 16)}…` : ' · Borrador sin cerrar'}`, M, H - 32);
    doc.text(`${i} / ${n}`, W - M, H - 32, { align: 'right' });
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
