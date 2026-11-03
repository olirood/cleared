import type { supabaseServer } from './supabase/server';
import { lcMissing, type CompRow, type Credit, type LCRecording } from './labelcopy';
import { SUMMARY_SELECT, summarize, type AgreementSummary } from './splitStatus';
import type { SplitState } from './tracks';
import { buildReps, type RepRow } from './reps';

type SB = Awaited<ReturnType<typeof supabaseServer>>;

// Estado del split vigente de varias obras (para listas de tracks)
export async function splitStates(sb: SB, works: { id: string; workspace_id: string }[]): Promise<Record<string, SplitState>> {
  if (!works.length) return {};
  const [{ data }, { data: repRows }] = await Promise.all([
    sb.from('split_agreements').select(SUMMARY_SELECT).neq('status', 'void').in('work_id', works.map((w) => w.id)),
    sb.rpc('workspace_reps'),
  ]);
  const reps = buildReps((repRows ?? []) as RepRow[]);
  const out: Record<string, SplitState> = {};
  for (const w of works) {
    const a = ((data ?? []) as unknown as AgreementSummary[]).find((x) => x.work_id === w.id);
    out[w.id] = { status: a ? (a.status as SplitState['status']) : 'none', label: summarize(a, w.workspace_id, reps).label };
  }
  return out;
}

// Composición para el label copy: lo congelado al enviar, o el directorio si sigue en borrador
export async function composition(sb: SB, workId: string | null): Promise<{ rows: CompRow[]; state: string; iswc: string | null }> {
  if (!workId) return { rows: [], state: 'Sin split', iswc: null };
  const [{ data: w }, { data: ag }] = await Promise.all([
    sb.from('works').select('iswc').eq('id', workId).maybeSingle(),
    sb.from('split_agreements').select('id, version, status').eq('work_id', workId).neq('status', 'void').maybeSingle(),
  ]);
  if (!ag) return { rows: [], state: 'Sin split', iswc: w?.iswc ?? null };
  const { data: ps } = await sb.from('split_participants')
    .select('role, share_bp, snapshot, people(legal_name, email, pro, ipi, publishers(name, ipi, email))')
    .eq('agreement_id', ag.id).order('position');
  const rows: CompRow[] = (ps ?? []).map((p) => {
    const s = p.snapshot as Record<string, string | null> | null;
    const pe = p.people as unknown as { legal_name: string; email: string | null; pro: string | null; ipi: string | null; publishers: { name: string; ipi: string | null; email: string | null } | null } | null;
    return {
      name: s?.legal_name ?? pe?.legal_name ?? '', role: p.role, share_bp: p.share_bp,
      publisher: s?.publisher ?? pe?.publishers?.name ?? '', publisher_ipi: s?.publisher_ipi ?? pe?.publishers?.ipi ?? '',
      pro: s?.pro ?? pe?.pro ?? '', ipi: s?.ipi ?? pe?.ipi ?? '', contact: pe?.publishers?.email || s?.email || pe?.email || '',
    };
  });
  const state = ag.status === 'signed' ? `Split v${ag.version} firmado` : ag.status === 'sent' ? `Split v${ag.version} en firma` : `Split v${ag.version} en borrador`;
  return { rows, state, iswc: w?.iswc ?? null };
}

// Qué le falta al label copy de cada track (para checklist y lista)
export async function labelCopyStates(sb: SB, recordingIds: string[], workOf: Record<string, string | null>) {
  if (!recordingIds.length) return {} as Record<string, { ok: boolean; why: string }>;
  const [{ data: recs }, { data: credits }, { data: parts }] = await Promise.all([
    sb.from('recordings').select('id, isrc, p_year, p_owner, c_year, c_owner').in('id', recordingIds),
    sb.from('credits').select('recording_id, role, person_id, display_name').in('recording_id', recordingIds),
    sb.from('split_agreements').select('work_id, split_participants(id)').neq('status', 'void').in('work_id', Object.values(workOf).filter(Boolean) as string[]),
  ]);
  const out: Record<string, { ok: boolean; why: string }> = {};
  for (const id of recordingIds) {
    const r = (recs ?? []).find((x) => x.id === id);
    if (!r) continue;
    const nComp = ((parts ?? []).find((a) => a.work_id === workOf[id])?.split_participants ?? []).length;
    const m = lcMissing(r as unknown as LCRecording, ((credits ?? []).filter((c) => c.recording_id === id)) as unknown as Credit[], Array(nComp).fill({}) as CompRow[]);
    out[id] = { ok: m.length === 0, why: m.length ? `Falta ${m.join(', ')}` : 'Completo' };
  }
  return out;
}
