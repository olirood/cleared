import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AGREEMENT_COLS, PART_COLS, SIG_COLS, WORK_COLS, type Agreement, type Approval, type Participant, type Signature, type Work } from '@/lib/splits';
import type { Person } from '@/lib/people';
import TopBar from '../../components/TopBar';
import { buildReps, type RepRow } from '@/lib/reps';
import SplitEditor from './SplitEditor';

export const metadata = { title: 'Split · Cleared' };

const PEOPLE_COLS = 'id, owner_workspace_id, represented_by, shared, legal_name, credit_name, nationality, email, phone, kinds, instruments, isni, pro, pro_member_no, ipi, publisher_id, publishers(id, name, ipi, email, owner_workspace_id)';

export default async function SplitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { sb, memberships, name } = await requireSession();
  const { data: w } = await sb.from('works').select(WORK_COLS).eq('id', id).maybeSingle();
  if (!w) notFound();
  const work = w as Work;

  const [wsAll, ags, recs, dir, repRows] = await Promise.all([
    sb.from('workspaces').select('id, name, letter_template').order('name'),
    sb.from('split_agreements').select(AGREEMENT_COLS).eq('work_id', id).order('version', { ascending: false }),
    sb.from('recordings').select('id, title, workspace_id').eq('work_id', id),
    sb.from('people').select(PEOPLE_COLS).contains('kinds', ['songwriter']).order('legal_name'),
    sb.rpc('workspace_reps'),
  ]);
  const agreements = (ags.data ?? []) as Agreement[];
  const current = agreements.find((a) => a.status !== 'void') ?? agreements[0] ?? null;

  let participants: Participant[] = [], approvals: Approval[] = [], signatures: Signature[] = [];
  let changes: { id: string; participant_id: string | null; note: string; created_at: string }[] = [];
  let sig = '';
  if (current) {
    const [ps, ap, cr, s] = await Promise.all([
      sb.from('split_participants').select(PART_COLS).eq('agreement_id', current.id).order('position'),
      sb.from('split_approvals').select('*').eq('agreement_id', current.id),
      sb.from('change_requests').select('id, participant_id, note, created_at').eq('agreement_id', current.id).order('created_at'),
      sb.rpc('participants_sig', { agreement: current.id }),
    ]);
    participants = (ps.data ?? []) as Participant[];
    approvals = (ap.data ?? []) as Approval[];
    changes = cr.data ?? [];
    sig = (s.data as string) ?? '';
    if (participants.length) {
      signatures = ((await sb.from('signatures').select(SIG_COLS).in('participant_id', participants.map((p) => p.id))).data ?? []) as Signature[];
      // firmas dibujadas aparte: si la migración aún no corre, la página sigue funcionando sin ellas
      const drawn = await sb.from('signatures').select('participant_id, signature_png').in('participant_id', participants.map((p) => p.id)).not('signature_png', 'is', null);
      if (!drawn.error) for (const d of drawn.data ?? []) { const s = signatures.find((x) => x.participant_id === d.participant_id); if (s) s.signature_png = d.signature_png; }
    }
  }
  const { data: log } = agreements.length
    ? await sb.from('audit_events').select('id, action, detail, at, entity_id, workspace_id').eq('entity', 'split').in('entity_id', agreements.map((a) => a.id)).order('at')
    : { data: [] };

  // personas del split que no estén en el directorio visible (p. ej. perfiles privados de otro espacio)
  const directory = (dir.data ?? []) as unknown as Person[];
  const missingIds = participants.map((p) => p.person_id).filter((pid) => !directory.some((d) => d.id === pid));
  const extra = missingIds.length ? ((await sb.from('people').select(PEOPLE_COLS).in('id', missingIds)).data ?? []) as unknown as Person[] : [];

  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <SplitEditor
          work={work}
          workspaces={(wsAll.data ?? []) as { id: string; name: string; letter_template: string }[]}
          memberships={memberships}
          agreements={agreements}
          current={current}
          participants={participants}
          approvals={approvals}
          signatures={signatures}
          changes={changes}
          currentSig={sig}
          log={(log ?? []) as { id: number; action: string; detail: Record<string, unknown> | null; at: string; entity_id: string; workspace_id: string | null }[]}
          tracks={(recs.data ?? []) as { id: string; title: string }[]}
          people={[...directory, ...extra]}
          reps={buildReps((repRows.data ?? []) as RepRow[])}
        />
      </main>
    </>
  );
}
