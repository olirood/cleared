// Tracks y carpetas: catálogos, tipos y checklist compartidos entre servidor y navegador

export const TRACK_TYPES = { single: 'Sencillo propio', feat: 'Feat', cover: 'Cover', remix: 'Remix' } as const;
export type TrackType = keyof typeof TRACK_TYPES;
export const RELEASE_TYPES = ['Sencillo', 'EP', 'Álbum'] as const;

export const LINK_KINDS = {
  demo: 'Demo', mix: 'Mezcla', master: 'Máster', instrumental: 'Instrumental', video: 'Video', other_link: 'Otro enlace',
} as const;
export type LinkKind = keyof typeof LINK_KINDS;

export const DOC_KINDS = { wfh: 'WFH', waiver: 'Waiver del invitado', license: 'Licencia', other_doc: 'Otro documento' } as const;
export type DocKind = keyof typeof DOC_KINDS;

export type DocStatus = 'na' | 'pending' | 'signed';

export type Asset = {
  id: string;
  recording_id: string;
  kind: string;
  label: string | null;
  file_name: string;
  storage_key: string | null;
  thumb_key: string | null;
  external_url: string | null;
  size_bytes: number | null;
  mime: string | null;
  sha256: string | null;
  created_at: string;
};

export type Recording = {
  id: string;
  workspace_id: string;
  title: string;
  version_title: string | null;
  main_artist: string | null;
  featured_artists: string | null;
  track_type: TrackType;
  isrc: string | null;
  release_title: string | null;
  release_type: string | null;
  release_date: string | null;
  label_handles_legal: boolean | null;
  wfh_status: DocStatus;
  waiver_status: DocStatus;
  license_status: DocStatus;
  created_at: string;
};

export type WorkspaceLegal = { id: string; name: string; label_handles_legal: boolean };

export const RECORDING_COLS =
  'id, workspace_id, title, version_title, main_artist, featured_artists, track_type, isrc, release_title, release_type, release_date, label_handles_legal, wfh_status, waiver_status, license_status, created_at';
export const ASSET_COLS = 'id, recording_id, kind, label, file_name, storage_key, thumb_key, external_url, size_bytes, mime, sha256, created_at';

export const labelHandles = (r: Pick<Recording, 'label_handles_legal'>, ws?: Pick<WorkspaceLegal, 'label_handles_legal'>) =>
  r.label_handles_legal ?? ws?.label_handles_legal ?? false;

// Documentos que pide este track según su tipo
export function requiredDocs(r: Pick<Recording, 'track_type'>): Exclude<DocKind, 'other_doc'>[] {
  const d: Exclude<DocKind, 'other_doc'>[] = ['wfh'];
  if (r.track_type === 'feat') d.push('waiver');
  if (r.track_type === 'cover' || r.track_type === 'remix') d.push('license');
  return d;
}
export const docStatus = (r: Recording, k: 'wfh' | 'waiver' | 'license'): DocStatus =>
  k === 'wfh' ? r.wfh_status : k === 'waiver' ? r.waiver_status : r.license_status;
export const docLabel = (r: Pick<Recording, 'track_type'>, k: DocKind) =>
  k === 'license' ? (r.track_type === 'cover' ? 'Licencia de la obra' : 'Licencia del original') : DOC_KINDS[k];

export type CheckItem = { key: string; label: string; ok: boolean; why: string; soon?: boolean; optional?: boolean };

export function checklist(r: Recording, assets: Asset[], ws?: WorkspaceLegal): CheckItem[] {
  const has = (k: string) => assets.some((a) => a.recording_id === r.id && a.kind === k);
  const items: CheckItem[] = [
    { key: 'ficha', label: 'Artista y ficha', ok: !!(r.title && r.main_artist), why: r.main_artist || 'Falta artista' },
    { key: 'demo', label: 'Demo', ok: has('demo'), why: has('demo') ? 'Enlace guardado' : 'Opcional', optional: true },
    { key: 'master', label: 'Máster final', ok: has('master'), why: has('master') ? 'Enlace guardado' : 'Falta enlace' },
    { key: 'cover', label: 'Portada', ok: has('cover'), why: has('cover') ? 'Guardada' : 'Falta' },
  ];
  if (!labelHandles(r, ws)) {
    for (const k of requiredDocs(r)) {
      const s = docStatus(r, k);
      items.push({ key: k, label: docLabel(r, k), ok: s !== 'pending', why: s === 'signed' ? 'Firmado' : s === 'na' ? 'No aplica' : 'Pendiente' });
    }
  }
  items.push({ key: 'split', label: 'Split sheet', ok: false, why: 'Llega con el módulo de splits', soon: true });
  items.push({ key: 'labelcopy', label: 'Label copy', ok: false, why: 'Llega con el módulo de label copy', soon: true });
  return items;
}
export const missingOf = (items: CheckItem[]) => items.filter((i) => !i.ok && !i.optional && !i.soon);

export const isWeTransfer = (url: string) => /(^|\/\/|\.)(wetransfer\.com|we\.tl)(\/|$)/i.test(url);
export const cleanIsrc = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export const fmtDate = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const fmtSize = (n: number | null) =>
  !n ? '' : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
