// Label copy: catálogos, reglas y el documento que se exporta (PDF y Excel)
import { ROLES, fmtPct } from './splits';

export const PROD_ROLES = [
  ['Producer', 'Producción'], ['Co-Producer', 'Coproducción'], ['Additional Producer', 'Producción adicional'],
  ['Vocal Producer', 'Producción vocal'], ['Recording Engineer', 'Ingeniería de grabación'], ['Mixing Engineer', 'Ingeniería de mezcla'],
  ['Mastering Engineer', 'Masterización'], ['Assistant Engineer', 'Asistencia de ingeniería'], ['Programmer', 'Programación'], ['Arranger', 'Arreglos'],
] as const;
export const VIS_ROLES = [
  ['Cover Design', 'Diseño de portada'], ['Cover Photography', 'Fotografía de portada'], ['Video Director', 'Dirección de video oficial'],
  ['Video Producer', 'Producción de video oficial'], ['Lyric Video Director', 'Dirección de video con letra'], ['Visualizer Director', 'Dirección de visualizer'],
] as const;
export const PERF_TYPES = { main: 'Artista principal', featured: 'Artista invitado', session: 'Músico de sesión' } as const;
export const INSTRUMENTS = ['Voz principal', 'Coros', 'Guitarra', 'Guitarra acústica', 'Requinto', 'Bajo', 'Bajo sexto', 'Tololoche', 'Acordeón', 'Tuba', 'Trompeta', 'Trombón', 'Clarinete', 'Saxofón', 'Batería', 'Percusión', 'Teclados', 'Piano', 'Sintetizador', 'Cuerdas', 'Violín'];
export const STUDIO_ROLES = ['Recording Engineer', 'Mixing Engineer', 'Mastering Engineer'];
export const CODE_FORMATS = { video: 'Video oficial', lyric: 'Video con letra', visualizer: 'Visualizer', karaoke: 'Video karaoke', mastertone: 'Mastertone' } as const;
export const LANGS = [['spa', 'Español'], ['eng', 'Inglés'], ['spa;eng', 'Español e inglés'], ['por', 'Portugués'], ['zxx', 'Instrumental, sin letra']] as const;
export const EXPLICIT = { no: 'Sin contenido explícito', explicit: 'Explícito', clean: 'Versión limpia' } as const;
export const COMP_ROLE_EN: Record<string, string> = { songwriter: 'Songwriter', lyricist: 'Lyricist', composer: 'Composer', arranger: 'Arranger' };
export const SUGGESTED: Record<string, string[]> = { production: ['producer', 'engineer'], performer: ['musician', 'artist'], visual: ['visual'] };

export const roleEs = (cat: string, role: string) => ((cat === 'visual' ? VIS_ROLES : PROD_ROLES) as readonly (readonly [string, string])[]).find((r) => r[0] === role)?.[1] ?? role;
export const langLabel = (v: string | null) => LANGS.find((l) => l[0] === v)?.[1] ?? v ?? '';
export const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
export function parseDuration(v: string): number | null | undefined {
  const t = v.trim(); if (!t) return null;
  const m = t.match(/^(\d{1,2}):([0-5]\d)$/); if (!m) return undefined;
  const s = +m[1] * 60 + +m[2]; return s > 0 ? s : undefined;
}

export type Credit = {
  id: string; recording_id: string; category: 'production' | 'performer' | 'visual'; role: string;
  person_id: string | null; display_name: string | null; detail: string | null; performer_type: 'main' | 'featured' | 'session' | null; position: number;
  people?: { legal_name: string; credit_name: string | null; email: string | null; isni: string | null } | null;
};
export const CREDIT_COLS = 'id, recording_id, category, role, person_id, display_name, detail, performer_type, position, people(legal_name, credit_name, email, isni)';
export type Code = { recording_id: string; format: string; isrc: string | null; upc: string | null };

export type LCRecording = {
  id: string; workspace_id: string; title: string; version_title: string | null; main_artist: string | null; featured_artists: string | null; track_type: string;
  isrc: string | null; upc: string | null; release_title: string | null; release_type: string | null; release_date: string | null;
  label_name: string | null; distributor: string | null; genre: string | null; explicit: 'no' | 'explicit' | 'clean'; language: string | null;
  duration_s: number | null; p_year: number | null; p_owner: string | null; c_year: number | null; c_owner: string | null; delivery_contact: string | null; work_id: string | null;
};
export const LC_COLS = 'id, workspace_id, title, version_title, main_artist, featured_artists, track_type, isrc, upc, release_title, release_type, release_date, label_name, distributor, genre, explicit, language, duration_s, p_year, p_owner, c_year, c_owner, delivery_contact, work_id';

export type CompRow = { name: string; role: string; share_bp: number; publisher: string; publisher_ipi: string; pro: string; ipi: string; contact: string };

export function lcMissing(r: LCRecording, credits: Credit[], comp: CompRow[]): string[] {
  const has = (role: string) => credits.some((c) => c.role === role && (c.person_id || c.display_name));
  const m: string[] = [];
  if (!r.isrc) m.push('ISRC');
  if (!(r.p_year && r.p_owner)) m.push('línea ℗');
  if (!(r.c_year && r.c_owner)) m.push('línea ©');
  if (!comp.length) m.push('composición');
  if (!has('Producer')) m.push('producción');
  if (!has('Mixing Engineer')) m.push('mezcla');
  if (!has('Mastering Engineer')) m.push('masterización');
  return m;
}

export type LCDoc = {
  workspace: string; title: string; version: string; artist: string; missing: string[]; splitState: string;
  release: [string, string][]; track: [string, string][];
  composition: string[][]; production: string[][]; performers: string[][]; visual: string[][]; codes: string[][]; materials: string[][];
  preparedBy: string; generated: string;
};

const cname = (c: Credit) => c.people ? (c.people.credit_name || c.people.legal_name) : (c.display_name || '');
const lname = (c: Credit) => c.people?.legal_name || '';

export function buildDoc(o: {
  workspace: string; r: LCRecording; iswc: string | null; credits: Credit[]; codes: Code[]; comp: CompRow[]; splitState: string;
  hasMaster: boolean; hasCover: boolean; preparedBy: string;
}): LCDoc {
  const { r } = o;
  const studio = (role: string) => o.credits.find((c) => c.role === role && c.detail)?.detail || '';
  const feat = (r.featured_artists || '').split(';').map((s) => s.trim()).filter(Boolean).join('; ');
  const date = r.release_date ? new Date(r.release_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const byCat = (cat: Credit['category']) => o.credits.filter((c) => c.category === cat && (c.person_id || c.display_name)).sort((a, b) => a.position - b.position);
  return {
    workspace: o.workspace, title: r.title, version: r.version_title || '', artist: r.main_artist || '', splitState: o.splitState,
    missing: lcMissing(r, o.credits, o.comp),
    release: [
      ['Lanzamiento', r.release_title || r.title], ['Tipo', r.release_type || ''], ['Artista principal', r.track_type === 'collab' ? [r.main_artist, ...(r.featured_artists || '').split(';').map((x) => x.trim()).filter(Boolean)].filter(Boolean).join(' & ') : r.main_artist || ''],
      ['Sello', r.label_name || ''], ['Distribuidora', r.distributor || ''], ['UPC', r.upc || ''], ['Fecha de lanzamiento', date],
      ['Género', r.genre || ''], ['Línea ℗', r.p_owner ? `℗ ${r.p_year ?? ''} ${r.p_owner}` : ''], ['Línea ©', r.c_owner ? `© ${r.c_year ?? ''} ${r.c_owner}` : ''],
    ],
    track: [
      ['Título', r.title], ['Versión', r.version_title || ''], ['Artista principal', r.main_artist || ''], [r.track_type === 'collab' ? 'Colabora con' : 'Artistas invitados', feat],
      ['ISRC', r.isrc || ''], ['ISWC', o.iswc || ''], ['Duración', fmtDuration(r.duration_s)], ['Contenido', EXPLICIT[r.explicit] ?? ''],
      ['Idioma', langLabel(r.language)], ['Grabado en', studio('Recording Engineer')], ['Mezclado en', studio('Mixing Engineer')], ['Masterizado en', studio('Mastering Engineer')],
    ],
    composition: o.comp.map((c) => [c.name, COMP_ROLE_EN[c.role] || c.role, fmtPct(c.share_bp), c.publisher || 'Sin editora', [c.pro, c.ipi && `IPI ${c.ipi}`].filter(Boolean).join(' · '), c.contact]),
    production: byCat('production').map((c) => [`${roleEs('production', c.role)} · ${c.role}`, cname(c), lname(c), c.detail || '']),
    performers: byCat('performer').map((c) => [c.role, cname(c), lname(c), PERF_TYPES[c.performer_type || 'session']]),
    visual: byCat('visual').map((c) => [`${roleEs('visual', c.role)} · ${c.role}`, cname(c), lname(c)]),
    codes: [['Audio estéreo', r.isrc || '', r.upc || ''], ...o.codes.filter((c) => c.isrc || c.upc).map((c) => [CODE_FORMATS[c.format as keyof typeof CODE_FORMATS] ?? c.format, c.isrc || '', c.upc || ''])],
    materials: [
      ['Máster', 'WAV estéreo, 24 bits, 48 kHz o más', o.hasMaster ? 'Enlace en Cleared' : 'Falta'],
      ['Portada', 'JPG o PNG en RGB, 3000 × 3000 px', o.hasCover ? 'En Cleared' : 'Falta'],
    ],
    preparedBy: o.preparedBy + (r.delivery_contact ? ` · ${r.delivery_contact}` : ''),
    generated: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export const SECTIONS: { key: keyof LCDoc; title: string; heads: string[] }[] = [
  { key: 'composition', title: 'Composición', heads: ['Nombre legal', 'Rol', '%', 'Editora', 'Sociedad · IPI', 'Contacto'] },
  { key: 'production', title: 'Producción e ingeniería', heads: ['Rol', 'Nombre en créditos', 'Nombre legal', 'Estudio / nota'] },
  { key: 'performers', title: 'Intérpretes', heads: ['Instrumento o voz', 'Nombre en créditos', 'Nombre legal', 'Tipo'] },
  { key: 'visual', title: 'Arte y video', heads: ['Rol', 'Nombre en créditos', 'Nombre legal'] },
  { key: 'codes', title: 'Códigos por formato', heads: ['Formato', 'ISRC', 'UPC'] },
  { key: 'materials', title: 'Materiales', heads: ['Material', 'Especificación', 'Estado'] },
];

export async function lcPdf(d: LCDoc): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48, CW = W - 2 * M;
  let y = 56;
  const ensure = (h: number) => { if (y + h > H - 48) { doc.addPage(); y = 56; return true; } return false; };
  // la fuente base del PDF no trae ℗
  const P = (v: string) => (v || '').replace(/℗/g, '(P)');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(110, 110, 116);
  doc.text(`LABEL COPY · ${d.workspace.toUpperCase()}`, M, y); y += 20;
  doc.setTextColor(10, 10, 12); doc.setFontSize(20); doc.text(d.title + (d.version ? ` (${d.version})` : ''), M, y, { maxWidth: CW - 150 }); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(80, 80, 86); doc.text(d.artist, M, y);
  doc.setFontSize(8.5); doc.setTextColor(d.missing.length ? 191 : 30, d.missing.length ? 52 : 125, d.missing.length ? 38 : 71);
  doc.text(d.missing.length ? `Falta: ${d.missing.join(', ')}` : 'Completo', W - M, y - 18, { align: 'right', maxWidth: 150 });
  y += 26;
  const h4 = (t: string, extra = '') => { ensure(40); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(10, 10, 12); doc.text(t, M, y);
    if (extra) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 116); doc.text(extra, W - M, y, { align: 'right' }); }
    y += 6; doc.setDrawColor(10); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); y += 14; };
  const kv = (rows: [string, string][]) => {
    const colW = CW / 2;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = ([rows[i], rows[i + 1]].filter(Boolean) as [string, string][]).map(([k, v]) => [P(k), P(v)] as [string, string]);
      const hs = pair.map(([, v]) => (doc.splitTextToSize(v || '—', colW - 120) as string[]).length);
      const rh = Math.max(...hs) * 11 + 6; ensure(rh);
      pair.forEach(([k, v], j) => {
        const x = M + j * colW;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 116); doc.text(k, x, y);
        doc.setFontSize(9); doc.setTextColor(v ? 10 : 160, v ? 10 : 160, v ? 12 : 166); doc.text(doc.splitTextToSize(v || '—', colW - 120), x + 112, y);
      });
      y += rh;
    }
    y += 8;
  };
  const table = (heads: string[], rows: string[][]) => {
    if (!rows.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(160, 160, 166); ensure(16); doc.text('Sin registros.', M, y); y += 18; return; }
    const w = CW / heads.length;
    const head = () => { ensure(18); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(110, 110, 116); heads.forEach((h, i) => doc.text(h.toUpperCase(), M + i * w, y)); y += 10; };
    head();
    rows.forEach((r) => {
      const cells = r.map((v) => doc.splitTextToSize(P(v) || '—', w - 8) as string[]);
      const rh = Math.max(...cells.map((c) => c.length)) * 10.5 + 6;
      if (ensure(rh)) head();
      doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, y - 7, W - M, y - 7);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(10, 10, 12);
      cells.forEach((c, i) => doc.text(c, M + i * w, y + 2));
      y += rh;
    });
    y += 10;
  };
  h4('Lanzamiento'); kv(d.release);
  h4('Track'); kv(d.track);
  SECTIONS.forEach((s) => { h4(s.title, s.key === 'composition' ? d.splitState : ''); table(s.heads, d[s.key] as string[][]); });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130, 130, 136);
    doc.text(`Preparó ${d.preparedBy} · ${d.generated} · Cleared · Página ${i} de ${n}`, W / 2, H - 28, { align: 'center' });
  }
  return doc.output('blob');
}

export async function lcXlsx(d: LCDoc): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  type C = { value?: string; fontWeight?: 'bold'; wrap?: boolean; backgroundColor?: string; color?: string } | null;
  const B = (v: string): C => ({ value: v, fontWeight: 'bold' });
  const V = (v: string): C => ({ value: v || '', wrap: true });
  const H = (v: string): C => ({ value: v, fontWeight: 'bold', backgroundColor: '#EDEDEF' });
  const resumen: C[][] = [
    [B(`Label copy · ${d.workspace}`)], [B(d.title + (d.version ? ` (${d.version})` : ''))], [V(d.artist)],
    [V(d.missing.length ? `Falta: ${d.missing.join(', ')}` : 'Completo')], [null],
    [H('Lanzamiento'), H('')], ...d.release.map(([k, v]) => [V(k), V(v)]), [null],
    [H('Track'), H('')], ...d.track.map(([k, v]) => [V(k), V(v)]), [null],
    [V(`Preparó ${d.preparedBy} · ${d.generated}`)],
  ];
  const sheet = (heads: string[], rows: string[][]): C[][] => [heads.map(H), ...rows.map((r) => r.map(V))];
  const sheets = [
    { sheet: 'Resumen', data: resumen, columns: [{ width: 26 }, { width: 48 }] },
    ...SECTIONS.map((s) => ({ sheet: s.title.slice(0, 31), data: sheet(s.heads, d[s.key] as string[][]), columns: s.heads.map(() => ({ width: 28 })) })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (writeXlsxFile as any)(sheets).toBlob();
}

export { ROLES };
