// Splits: roles, porcentajes y contenido canónico (para la huella)

export const ROLES = {
  songwriter: 'Autor y compositor',
  lyricist: 'Autor (letra)',
  composer: 'Compositor (música)',
  arranger: 'Arreglista',
} as const;
export type Role = keyof typeof ROLES;
export const ROLE_EN: Record<string, string> = {
  songwriter: 'Lyricist & Composer', lyricist: 'Lyricist', composer: 'Composer', arranger: 'Arranger',
};

export const CONSENT_V = 'consentimiento-electronico-v1';

export const fmtPct = (bp: number) => (bp / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
export function parsePct(s: string): number | null {
  const n = Number(String(s).replace(',', '.').replace('%', '').trim());
  if (!isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 100);
}
// reparte 10000 puntos en partes iguales; el residuo va a los primeros
export function equalShares(n: number): number[] {
  const base = Math.floor(10000 / n), extra = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

export type Snapshot = {
  legal_name: string; credit_name: string | null; pro: string | null; pro_member_no: string | null; ipi: string | null;
  publisher: string | null; publisher_ipi: string | null; email: string | null; phone: string | null; nationality: string | null;
};

export type Agreement = {
  id: string; work_id: string; version: number; status: 'draft' | 'sent' | 'signed' | 'void';
  template: string | null; sent_at: string | null; completed_at: string | null; content_sha256: string | null; created_at: string;
};
export type Participant = {
  id: string; agreement_id: string; person_id: string; role: Role; share_bp: number; credits: string | null;
  snapshot: Snapshot | null; position: number;
};
export type Signature = {
  id: string; participant_id: string; status: 'pending' | 'signed' | 'void'; expires_at: string; signed_at: string | null;
  method: string | null; consent_version: string | null; typed_name: string | null; ip: string | null; user_agent: string | null;
};
export type Approval = {
  agreement_id: string; workspace_id: string; status: 'approved' | 'changes_requested'; note: string | null;
  participants_sig: string; decided_by: string; decided_at: string;
};
export type Work = {
  id: string; workspace_id: string; title: string; artist: string | null; session_with: string | null;
  session_date: string | null; studio: string | null; notes: string | null; created_at: string;
};

export const AGREEMENT_COLS = 'id, work_id, version, status, template, sent_at, completed_at, content_sha256, created_at';
export const PART_COLS = 'id, agreement_id, person_id, role, share_bp, credits, snapshot, position';
export const SIG_COLS = 'id, participant_id, status, expires_at, signed_at, method, consent_version, typed_name, ip, user_agent';
export const WORK_COLS = 'id, workspace_id, title, artist, session_with, session_date, studio, notes, created_at';

// Igual que participants_sig() en la base: persona:rol:puntos ordenado por persona
export const participantsSig = (ps: { person_id: string; role: string; share_bp: number }[]) =>
  [...ps].sort((a, b) => (a.person_id < b.person_id ? -1 : 1)).map((p) => `${p.person_id}:${p.role}:${p.share_bp}`).join('|');

// Contenido que se firma; su SHA-256 queda en el split al enviarlo
export function canonical(work: { title: string; artist: string | null }, version: number, template: string, ps: { role: string; share_bp: number; credits: string | null; snapshot: Snapshot }[]) {
  return JSON.stringify({
    obra: { titulo: work.title, artista: work.artist || '', version },
    plantilla: template,
    participantes: ps.map((p) => ({
      nombre: p.snapshot.legal_name, rol: p.role, bp: p.share_bp, sociedad: p.snapshot.pro || '', ipi: p.snapshot.ipi || '',
      editora: p.snapshot.publisher || '', creditos: p.credits || '',
    })),
  });
}

export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '';
