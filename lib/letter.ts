// Carta de split: el mismo modelo arma la vista en pantalla y el PDF.
// La carta va en el idioma que eligió quien creó el split (todos firman el mismo texto);
// la constancia de firma va aparte, en el mismo idioma, con el aviso que aceptó cada quien.
import { ROLE_EN, ROLES, fmtPct } from './splits';
import { AVISOS, avisoByVersion, type Lang } from './aviso';

export type { Lang };

const L = {
  en: {
    title: 'Songwriters’ Split Letter',
    salutation: 'To Whom It May Concern:',
    intro: 'This letter shall confirm the understanding between the songwriters listed below as to the division of ownership interest in the Composition (as defined below):',
    songTitle: 'Song Title(s):', aka: ' of the artists or band professionally known as ',
    writers: 'Writers & Splits:', splitsLead: 'Each songwriter hereunder agrees that the ownership interest in the Composition shall be divided as follows:',
    originalityH: 'Originality of Contribution.',
    originality: 'Each songwriter individually and only with respect to his/her respective contribution and ownership interest in the Composition hereby certifies that all materials provided by him/ her are entirely original, do not contain any so-called “samples” and otherwise do not infringe the rights (including copyright) of any third party.',
    warrantiesH: 'Warranties & Representations.',
    warranties: 'Each songwriter warrants and represents that he/she is free to enter into this agreement and has no restriction, contractual or otherwise, that would impede him/her from doing so. Each songwriter further represents that the information, understanding and representations contained in this agreement are correct and accurate and agrees to indemnify and hold harmless his/her co-songwriters hereunder from any third party claim that arises out of a breach or misrepresentation of any warranty and/or representation contained herein.',
    counterparts: 'This agreement may be executed in counterparts, and facsimile and photocopied signatures of this agreement shall be treated as originals for all purposes relating to this agreement.',
    confirm: 'Please confirm your agreement with the foregoing by arranging the signatures where indicated below.',
    accepted: 'READ, AGREED TO AND ACCEPTED:',
    cols: ['Full legal name', 'Role', 'Publishing designee', 'PRO · IPI', 'Share'],
    credits: 'Credits', total: 'Total', version: 'Version',
    state: { signed: 'Signed by all parties', sent: 'Out for signature', void: 'Void', draft: 'Draft' } as Record<string, string>,
    signedAt: 'Signed electronically', pending: 'Pending signature', na: 'N/A',
  },
  es: {
    title: 'Carta de reparto autoral (split sheet)',
    salutation: 'A quien corresponda:',
    intro: 'Por medio de la presente se hace constar el acuerdo entre los autores que se indican abajo respecto de la división de la titularidad de la Obra (según se define abajo):',
    songTitle: 'Título(s) de la obra:', aka: ' de los artistas o agrupación conocidos profesionalmente como ',
    writers: 'Autores y porcentajes:', splitsLead: 'Cada autor acuerda que la titularidad de la Obra se dividirá de la siguiente manera:',
    originalityH: 'Originalidad de la contribución.',
    originality: 'Cada autor, de manera individual y únicamente respecto de su contribución y porcentaje en la Obra, certifica que todos los materiales que aportó son totalmente originales, no contienen los llamados “samples” y no infringen derechos de terceros, incluidos los derechos de autor.',
    warrantiesH: 'Declaraciones y garantías.',
    warranties: 'Cada autor declara que está en libertad de celebrar este acuerdo y que no tiene restricción alguna, contractual o de otro tipo, que se lo impida. Cada autor declara además que la información, los acuerdos y las declaraciones contenidos en este documento son correctos y exactos, y se obliga a sacar en paz y a salvo a los demás autores de cualquier reclamación de terceros derivada del incumplimiento o la falsedad de cualquiera de sus declaraciones o garantías.',
    counterparts: 'Este acuerdo podrá firmarse en ejemplares separados, y las firmas en facsímil o fotocopia tendrán el mismo valor que las originales para todos los efectos.',
    confirm: 'Para confirmar su conformidad con lo anterior, firme en el lugar indicado abajo.',
    accepted: 'LEÍDO, CONVENIDO Y ACEPTADO:',
    cols: ['Nombre legal', 'Rol', 'Editora', 'Sociedad · IPI', 'Porcentaje'],
    credits: 'Créditos', total: 'Total', version: 'Versión',
    state: { signed: 'Firmada por todas las partes', sent: 'En firma', void: 'Anulada', draft: 'Borrador' } as Record<string, string>,
    signedAt: 'Firmado electrónicamente', pending: 'Pendiente de firma', na: 'N/A',
  },
};
export const LETTERS = L;
export const LETTER = L.en;       // compatibilidad
export const COLS = L.en.cols;    // compatibilidad
export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español' };

const MONTHS = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] };
export function fmtLong(iso: string, lang: Lang = 'en') {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(+d)) return iso;
  return lang === 'es' ? `${d.getDate()} de ${MONTHS.es[d.getMonth()]} de ${d.getFullYear()}` : `${MONTHS.en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export const fmtEn = (iso: string) => fmtLong(iso, 'en');
// fecha y hora de CDMX en el idioma del documento
export const fmtStamp = (iso: string | null, lang: Lang = 'es') =>
  iso ? new Date(iso).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '';

export type LetterRow = {
  name: string; artist: string; role: string; pct: string; publisher: string; pro: string; ipi: string; credits: string;
  signed: boolean; signedAt: string | null; typedName: string | null; method: string | null; ip: string | null; contact: string;
  sigImage: string | null;   // firma dibujada (PNG), si la dibujó
  consent: string | null;    // versión del aviso que aceptó
};
export type LetterModel = {
  title: string; artist: string; version: number; status: string; date: string; template: string; workspace: string; lang?: Lang;
  rows: LetterRow[]; hash: string | null; sentAt: string | null; completedAt: string | null; log: { at: string; text: string }[];
};

// en inglés, las opciones en español del perfil se traducen
const PRO_EN: Record<string, string> = { Ninguna: 'None', Otra: 'Other' };

export function rowFrom(p: {
  role: string; share_bp: number; credits: string | null;
  snap: { legal_name?: string | null; credit_name?: string | null; publisher?: string | null; pro?: string | null; ipi?: string | null; email?: string | null; phone?: string | null };
  sig?: { status?: string; signed_at?: string | null; typed_name?: string | null; method?: string | null; ip?: string | null; signature_png?: string | null; consent_version?: string | null } | null;
}, lang: Lang = 'en'): LetterRow {
  const s = p.snap;
  return {
    name: s.legal_name || '', artist: s.credit_name || '',
    role: lang === 'es' ? (ROLES as Record<string, string>)[p.role] ?? p.role : ROLE_EN[p.role] || p.role, pct: fmtPct(p.share_bp),
    publisher: s.publisher || 'N/A', pro: lang === 'en' ? PRO_EN[s.pro || ''] ?? (s.pro || '') : s.pro || '', ipi: s.ipi || '', credits: p.credits || '',
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

// Lienzo común: carta y constancia comparten tipografía, márgenes y pie de página
async function canvas() {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 64, CW = W - 2 * M, TOP = 60, BOTTOM = H - 58;
  const k = { doc, W, H, M, CW, TOP, BOTTOM, y: TOP };
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (st: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number, c: [number, number, number] = BODY, family = 'helvetica') => { doc.setFont(family, st); doc.setFontSize(size); color(c); };
  const newPage = () => { doc.addPage(); k.y = TOP; };
  const ensure = (h: number) => { if (k.y + h > BOTTOM) { newPage(); return true; } return false; };
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
      ln.forEach(([w, st]) => { font(st, size, st.startsWith('bold') ? INK : (o.c ?? BODY)); doc.text(w, x, k.y + size); x += doc.getTextWidth(w); });
      k.y += lh;
    });
    k.y += gap;
    return h;
  };
  const footer = (left: string) => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
      font('normal', 6.8, MUTED);
      doc.text(left, M, H - 32);
      doc.text(`${i} / ${n}`, W - M, H - 32, { align: 'right' });
    }
  };
  return { k, doc, color, font, newPage, ensure, para, footer };
}

// ---------- la carta (lo que se manda a disqueras, editoras y sociedades) ----------
export async function letterPdf(m: LetterModel, logoOverride?: string | null): Promise<Blob> {
  const lang = m.lang ?? 'en', T = L[lang];
  const { k, doc, color, font, newPage, ensure, para, footer } = await canvas();
  const { W, M, CW, TOP, BOTTOM } = k;
  const { SIG_FONT } = await import('./sigFont');
  doc.addFileToVFS('Parisienne.ttf', SIG_FONT);
  doc.addFont('Parisienne.ttf', 'Parisienne', 'normal');

  // membrete
  const logo = m.template === 'apollo' ? (logoOverride !== undefined ? logoOverride : await logoData()) : null;
  if (logo) {
    const lw = 116, lh = lw * (326 / 760);
    doc.addImage(logo, 'PNG', M, k.y - 6, lw, lh, 'apollo-logo', 'FAST');
    k.y += lh - 6;
  } else {
    font('bold', 10.5, INK); doc.setCharSpace(1.6);
    doc.text(m.workspace.toUpperCase(), M, k.y + 10); doc.setCharSpace(0);
    k.y += 18;
  }
  font('normal', 8, MUTED);
  doc.text(`${T.version} ${m.version} · ${T.state[m.status] ?? T.state.draft}`, W - M, TOP + 10, { align: 'right' });
  k.y += 12;
  doc.setDrawColor(...RULE); doc.setLineWidth(0.8); doc.line(M, k.y, W - M, k.y);
  k.y += 22;

  font('bold', 20, INK); doc.text(T.title, M, k.y + 4); k.y += 18;
  font('normal', 9.5, MUTED); doc.text(fmtLong(m.date, lang), M, k.y + 9); k.y += 22;

  para([[T.salutation, 'normal']], { gap: 6 });
  para([[T.intro, 'normal']], { gap: 10 });
  para([[T.songTitle, 'bold'], [' ', 'normal'], [`“${m.title}”`, 'bolditalic'], [T.aka, 'normal'], [(m.artist || '—') + '.', 'bold']], { gap: 10 });
  para([[T.writers, 'bold'], [' ' + T.splitsLead, 'normal']], { gap: 12 });

  // tabla de autores
  const widths = [170, 82, 100, 80, 52];   // suman el ancho útil (484)
  const xs = widths.reduce<number[]>((a, _w, i) => (a.push(i ? a[i - 1] + widths[i - 1] : M), a), []);
  const PADX = 8;
  const head = () => {
    const hh = 24; ensure(hh + 40);
    doc.setFillColor(...TINT); doc.roundedRect(M, k.y, CW, hh, 4, 4, 'F');
    font('bold', 7, MUTED); doc.setCharSpace(0.5);
    T.cols.forEach((c, i) => {
      const t = c.toUpperCase();
      if (i === T.cols.length - 1) doc.text(t, xs[i] + widths[i] - PADX, k.y + 15, { align: 'right' });
      else doc.text(t, xs[i] + PADX, k.y + 15);
    });
    doc.setCharSpace(0);
    k.y += hh;
  };
  head();
  m.rows.forEach((r, idx) => {
    font('bold', 9, INK);
    const nameL = doc.splitTextToSize(r.name, widths[0] - 2 * PADX) as string[];
    font('normal', 8, MUTED);
    const subL = [
      ...(r.artist ? doc.splitTextToSize(r.artist, widths[0] - 2 * PADX) as string[] : []),
      ...(r.credits ? doc.splitTextToSize(`${T.credits}: ${r.credits}`, widths[0] - 2 * PADX) as string[] : []),
    ];
    font('normal', 9, BODY);
    const roleL = doc.splitTextToSize(r.role, widths[1] - 2 * PADX) as string[];
    const pubL = doc.splitTextToSize(r.publisher, widths[2] - 2 * PADX) as string[];
    const proL = [r.pro || '—', ...(r.ipi ? [`IPI ${r.ipi}`] : [])];
    const rh = Math.max(nameL.length * 11.5 + subL.length * 10.5, roleL.length * 11.5, pubL.length * 11.5, proL.length * 11.5) + 15;
    if (ensure(rh)) head();
    const ty = k.y + 13;
    font('bold', 9, INK); doc.text(nameL, xs[0] + PADX, ty, { lineHeightFactor: 1.28 });
    if (subL.length) { font('normal', 8, MUTED); doc.text(subL, xs[0] + PADX, ty + nameL.length * 11.5, { lineHeightFactor: 1.3 }); }
    font('normal', 9, BODY);
    doc.text(roleL, xs[1] + PADX, ty, { lineHeightFactor: 1.28 });
    doc.text(pubL, xs[2] + PADX, ty, { lineHeightFactor: 1.28 });
    doc.text(proL[0], xs[3] + PADX, ty);
    if (proL[1]) { font('normal', 8, MUTED); doc.text(proL[1], xs[3] + PADX, ty + 11.5); }
    font('bold', 10, INK); doc.text(`${r.pct}%`, xs[4] + widths[4] - PADX, ty, { align: 'right' });
    k.y += rh;
    if (idx < m.rows.length - 1) { doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(M, k.y, W - M, k.y); }
  });
  const total = m.rows.reduce((t, r) => t + (parseFloat(r.pct) || 0), 0);
  doc.setDrawColor(...INK); doc.setLineWidth(0.8); doc.line(M, k.y, W - M, k.y);
  font('bold', 8, MUTED); doc.setCharSpace(0.5); doc.text(T.total.toUpperCase(), M + PADX, k.y + 15); doc.setCharSpace(0);
  font('bold', 10, INK); doc.text(`${Math.round(total * 100) / 100}%`, W - M - PADX, k.y + 15, { align: 'right' });
  k.y += 28;

  // cláusulas
  para([[T.originalityH, 'bold'], [' ' + T.originality, 'normal']]);
  para([[T.warrantiesH, 'bold'], [' ' + T.warranties, 'normal']]);
  para([[T.counterparts, 'normal']]);

  // el cierre y las firmas van juntos: si no caben, pasan completos a la hoja siguiente
  const SIG_H = 78, SIG_LAST = 58, SIG_GAP = 36;
  const colW = (CW - SIG_GAP) / 2;
  const sigRows = Math.ceil(m.rows.length / 2);
  const closing = para([[T.confirm, 'normal']], { measure: true, gap: 14 }) + 14 + 20 + (Math.min(sigRows, 2) - 1) * SIG_H + SIG_LAST;
  if (k.y + closing > BOTTOM) newPage();
  para([[T.confirm, 'normal']], { gap: 14 });
  font('bold', 9.6, INK); doc.text(T.accepted, M, k.y + 9.6); k.y += 14 + 20;

  for (let i = 0; i < m.rows.length; i += 2) {
    ensure(i + 2 >= m.rows.length ? SIG_LAST : SIG_H);
    [m.rows[i], m.rows[i + 1]].forEach((r, n) => {
      if (!r) return;
      const x = M + n * (colW + SIG_GAP);
      const lineY = k.y + 34;
      if (r.signed && r.sigImage) {
        // firma dibujada: cabe en la caja sobre la línea sin deformarse
        try {
          const ip = doc.getImageProperties(r.sigImage);
          const f = Math.min((colW - 8) / ip.width, 40 / ip.height);
          doc.addImage(r.sigImage, 'PNG', x + 2, lineY - 3 - ip.height * f, ip.width * f, ip.height * f, undefined, 'FAST');
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
      if (r.signed) doc.text(`${T.signedAt} · ${fmtStamp(r.signedAt, lang)}`, x, lineY + 26);
      else if (m.status !== 'draft') doc.text(T.pending, x, lineY + 26);
    });
    k.y += SIG_H;
  }

  footer(`Cleared · ${m.title} · v${m.version}${m.hash ? ` · SHA-256 ${m.hash.slice(0, 16)}…` : ''}`);
  return doc.output('blob');
}

// ---------- constancia de firma (documento aparte, con el aviso que aceptó cada quien) ----------
const C = {
  es: {
    title: 'Constancia de firma electrónica', sub: 'Acompaña a la carta de split con la misma huella SHA-256',
    document: 'Documento', signers: 'Firmantes', log: 'Bitácora',
    work: 'Obra', doc: 'Documento', status: 'Estado', sent: 'Enviado a firma', completed: 'Completado', hash: 'Huella SHA-256', kind: 'Tipo de firma', lang: 'Idioma de la carta',
    st: { signed: 'Firmado por todas las partes', sent: 'En proceso de firma', void: 'Versión anulada', draft: 'Borrador' } as Record<string, string>,
    tz: '(hora de CDMX)', version: 'versión', pendingHash: 'Se calcula al cerrar el documento',
    kindTxt: 'Firma electrónica simple con enlace único y código por correo (Código de Comercio, arts. 89 a 93). Sin constancia NOM-151.',
    sStatus: 'Estado', verif: 'Verificación', typed: 'Nombre escrito', ip: 'Dirección IP', consent: 'Consentimiento',
    signedOn: 'Firmó', notSent: 'Sin enviar', pending: 'Pendiente de firma', SIGNED: 'FIRMADO', PENDING: 'PENDIENTE',
    consentTxt: (title: string, label: string) => `Aceptó el ${title} (${label}, anexo) y firmar por medios electrónicos.`,
    consentOld: 'Aceptó firmar por medios electrónicos.',
    annex: (label: string) => `Anexo · ${label} · aceptado por quienes firmaron con esta versión`,
  },
  en: {
    title: 'Electronic signature certificate', sub: 'Accompanies the split letter with the same SHA-256 fingerprint',
    document: 'Document', signers: 'Signers', log: 'Activity log',
    work: 'Work', doc: 'Document', status: 'Status', sent: 'Sent for signature', completed: 'Completed', hash: 'SHA-256 fingerprint', kind: 'Signature type', lang: 'Letter language',
    st: { signed: 'Signed by all parties', sent: 'Out for signature', void: 'Voided version', draft: 'Draft' } as Record<string, string>,
    tz: '(Mexico City time)', version: 'version', pendingHash: 'Calculated when the document is closed',
    kindTxt: 'Simple electronic signature with a unique link and an emailed code (Mexican Commercial Code, arts. 89 to 93). No NOM-151 certificate.',
    sStatus: 'Status', verif: 'Verification', typed: 'Typed name', ip: 'IP address', consent: 'Consent',
    signedOn: 'Signed', notSent: 'Not sent', pending: 'Pending signature', SIGNED: 'SIGNED', PENDING: 'PENDING',
    consentTxt: (title: string, label: string) => `Accepted the ${title} (${label}, attached) and to sign electronically.`,
    consentOld: 'Agreed to sign electronically.',
    annex: (label: string) => `Attachment · ${label} · accepted by those who signed with this version`,
  },
};
// el método se guarda en español; en inglés se traduce para la constancia
const methodEn = (m: string) => m.replace('Enlace único por WhatsApp', 'Unique link via WhatsApp').replace('código al correo', 'code to email')
  .replace('firma dibujada y nombre escrito', 'drawn signature and typed name').replace('nombre escrito', 'typed name');

export async function certificatePdf(m: LetterModel): Promise<Blob> {
  const lang = m.lang ?? 'en', T = C[lang];
  const { k, doc, font, newPage, ensure, para, footer } = await canvas();
  const { W, M, CW } = k;

  font('bold', 17, INK); doc.text(T.title, M, k.y + 6); k.y += 20;
  font('normal', 8.5, MUTED); doc.text(T.sub, M, k.y + 6); k.y += 26;

  const kvRows = (rows: [string, string, boolean?][], boxed: boolean) => {
    const keyW = 118, valW = CW - keyW - (boxed ? 28 : 0), x0 = M + (boxed ? 14 : 0);
    const items = rows.map(([key, v, mono]) => {
      doc.setFont(mono ? 'courier' : 'helvetica', 'normal'); doc.setFontSize(mono ? 7.6 : 8.6);
      return { key, mono, lines: doc.splitTextToSize(v, valW) as string[] };
    });
    const h = items.reduce((t, it) => t + it.lines.length * 11.5 + 6, 0) + (boxed ? 20 : 0);
    ensure(h);
    if (boxed) { doc.setFillColor(...TINT); doc.roundedRect(M, k.y, CW, h, 6, 6, 'F'); k.y += 14; }
    items.forEach((it) => {
      font('normal', 8, MUTED); doc.text(it.key, x0, k.y + 8);
      if (it.mono) { doc.setFont('courier', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...INK); }
      else font('normal', 8.6, INK);
      doc.text(it.lines, x0 + keyW, k.y + 8, { lineHeightFactor: 1.33 });
      k.y += it.lines.length * 11.5 + 6;
    });
    k.y += boxed ? 6 : 0;
  };
  const section = (t: string) => { ensure(40); k.y += 14; font('bold', 7.5, MUTED); doc.setCharSpace(0.8); doc.text(t.toUpperCase(), M, k.y + 6); doc.setCharSpace(0); k.y += 16; };

  section(T.document);
  kvRows([
    [T.work, `“${m.title}”${m.artist ? ` · ${m.artist}` : ''}`],
    [T.doc, `${L[lang].title} · ${m.workspace} · ${T.version} ${m.version}`],
    [T.lang, LANG_NAMES[lang]],
    [T.status, T.st[m.status] ?? T.st.draft],
    ...(m.sentAt ? [[T.sent, `${fmtStamp(m.sentAt, lang)} ${T.tz}`] as [string, string]] : []),
    ...(m.completedAt ? [[T.completed, `${fmtStamp(m.completedAt, lang)} ${T.tz}`] as [string, string]] : []),
    [T.hash, m.hash || T.pendingHash, true],
    [T.kind, T.kindTxt],
  ], true);

  section(T.signers);
  m.rows.forEach((r, i) => {
    const av = avisoByVersion(r.consent);
    const rows: [string, string, boolean?][] = [
      [T.sStatus, r.signed ? `${T.signedOn} · ${fmtStamp(r.signedAt, lang)} ${T.tz}` : m.status === 'draft' ? T.notSent : T.pending],
      ...(r.signed ? [
        [T.verif, lang === 'en' ? methodEn(r.method || 'Enlace único') : r.method || 'Enlace único'] as [string, string],
        [T.typed, r.typedName || ''] as [string, string],
        ...(r.ip ? [[T.ip, r.ip] as [string, string]] : []),
        [T.consent, av ? T.consentTxt(av[1].title, av[1].label) : T.consentOld] as [string, string],
      ] : []),
    ];
    ensure(30 + rows.length * 17);
    if (i) { doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(M, k.y, W - M, k.y); k.y += 10; }
    font('bold', 9.6, INK); doc.text(r.name, M, k.y + 9);
    font('bold', 7.5, r.signed ? OK : MUTED); doc.text(r.signed ? T.SIGNED : T.PENDING, W - M, k.y + 9, { align: 'right' });
    k.y += 18;
    kvRows(rows, false);
    k.y += 6;
  });

  if (m.log.length) {
    section(T.log);
    m.log.forEach((l) => {
      font('normal', 8.4, INK);
      const ls = doc.splitTextToSize(l.text, CW - 130) as string[];
      ensure(ls.length * 11 + 6);
      font('normal', 8, MUTED); doc.text(fmtStamp(l.at, lang), M, k.y + 8);
      font('normal', 8.4, INK); doc.text(ls, M + 130, k.y + 8, { lineHeightFactor: 1.3 });
      k.y += ls.length * 11 + 6;
    });
  }

  // anexos: cada aviso aceptado, tal cual, en el idioma en que se aceptó
  const accepted = [...new Set(m.rows.map((r) => r.consent).filter(Boolean))].map((v) => avisoByVersion(v)).filter(Boolean) as [Lang, (typeof AVISOS)[Lang]][];
  for (const [, A] of accepted) {
    newPage();
    font('bold', 17, INK); doc.text(A.title, M, k.y + 6); k.y += 20;
    font('normal', 8.5, MUTED); doc.text(T.annex(A.label), M, k.y + 6); k.y += 26;
    for (const x of A.sections(m.workspace)) {
      ensure(40);
      font('bold', 10, INK); doc.text(x.h, M, k.y + 8); k.y += 16;
      para([[x.p, 'normal']], { size: 9.2, gap: 10 });
    }
    ensure(30); font('bold', 10, INK); doc.text(A.confirmHead, M, k.y + 8); k.y += 16;
    for (const c of A.confirm) para([['•  ' + c, 'normal']], { size: 9.2, gap: 2 });
  }

  footer(`Cleared · ${T.title} · ${m.title} · v${m.version}${m.hash ? ` · SHA-256 ${m.hash.slice(0, 16)}…` : ''}`);
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, ' ') || 'split';
