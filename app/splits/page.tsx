import { requireSession } from '@/lib/session';
import { WORK_COLS, type Work } from '@/lib/splits';
import { SUMMARY_SELECT, type AgreementSummary } from '@/lib/splitStatus';
import TopBar from '../components/TopBar';
import { buildReps, type RepRow } from '@/lib/reps';
import SplitList from './SplitList';

export const metadata = { title: 'Splits · Cleared' };

export default async function SplitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { sb, memberships, name } = await requireSession();
  const [works, ws, repRows] = await Promise.all([
    sb.from('works').select(`${WORK_COLS}, recordings(id, title)`).order('created_at', { ascending: false }),
    sb.from('workspaces').select('id, name').order('name'),
    sb.rpc('workspace_reps'),
  ]);
  const list = (works.data ?? []) as (Work & { recordings: { id: string; title: string }[] })[];
  const ags = list.length
    ? ((await sb.from('split_agreements').select(SUMMARY_SELECT).neq('status', 'void').in('work_id', list.map((w) => w.id))).data ?? []) as unknown as AgreementSummary[]
    : [];
  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <SplitList works={list} agreements={ags} workspaces={ws.data ?? []} memberships={memberships} reps={buildReps((repRows.data ?? []) as RepRow[])} startCreating={sp.nuevo === '1'} />
      </main>
    </>
  );
}
