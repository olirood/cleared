import { participantsSig } from './splits';

export type AgreementSummary = {
  id: string; work_id: string; version: number; status: 'draft' | 'sent' | 'signed' | 'void';
  split_participants: { id: string; person_id: string; share_bp: number; role: string; people: { represented_by: string | null } | null; signatures: { status: string } | { status: string }[] | null }[];
  split_approvals: { workspace_id: string; status: string; participants_sig: string }[];
  change_requests?: { id: string }[];
};
export const SUMMARY_SELECT =
  'id, work_id, version, status, split_participants(id, person_id, share_bp, role, people(represented_by), signatures(status)), split_approvals(workspace_id, status, participants_sig), change_requests(id)';

const sigStatus = (s: AgreementSummary['split_participants'][number]['signatures']) =>
  Array.isArray(s) ? s[0]?.status : s?.status;

// Estado corto de un split para listas y checklist
export function summarize(a: AgreementSummary | undefined, ownerWs: string) {
  if (!a) return { label: 'Sin split', tone: 'crit' as const, signed: 0, total: 0, reps: [] as { ws: string; state: 'ok' | 'pending' | 'stale' | 'changes' }[] };
  const ps = a.split_participants || [];
  const total = ps.length;
  const signed = ps.filter((p) => sigStatus(p.signatures) === 'signed').length;
  const sum = ps.reduce((x, p) => x + p.share_bp, 0);
  const sig = participantsSig(ps.map((p) => ({ person_id: p.person_id, role: p.role, share_bp: p.share_bp })));
  const repWs = [...new Set(ps.map((p) => p.people?.represented_by).filter((w): w is string => !!w && w !== ownerWs))];
  const reps = repWs.map((ws) => {
    const ap = a.split_approvals.find((x) => x.workspace_id === ws);
    const state: 'ok' | 'pending' | 'stale' | 'changes' = !ap ? 'pending' : ap.participants_sig !== sig ? (ap.status === 'approved' ? 'stale' : 'pending') : ap.status === 'approved' ? 'ok' : 'changes';
    return { ws, state };
  });
  if (a.status === 'signed') return { label: `v${a.version} · firmado`, tone: 'ok' as const, signed, total, reps };
  if (a.status === 'sent' && a.change_requests?.length) return { label: `v${a.version} · pidieron cambio`, tone: 'crit' as const, signed, total, reps };
  if (a.status === 'sent') return { label: `v${a.version} · ${signed}/${total} firmas`, tone: 'warn' as const, signed, total, reps };
  const waiting = reps.filter((r) => r.state !== 'ok').length;
  return {
    label: total === 0 ? `v${a.version} · sin participantes` : sum !== 10000 ? `v${a.version} · suma ${(sum / 100).toFixed(2).replace(/\.00$/, '')} %` : waiting ? `v${a.version} · falta aprobación` : `v${a.version} · listo para enviar`,
    tone: (total && sum === 10000 && !waiting ? 'info' : 'crit') as 'info' | 'crit', signed, total, reps,
  };
}
