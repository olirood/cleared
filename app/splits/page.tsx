import { requireSession } from '@/lib/session';
import { WORK_COLS, type Work } from '@/lib/splits';
import { SUMMARY_SELECT, type AgreementSummary } from '@/lib/splitStatus';
import TopBar from '../components/TopBar';
import SplitList from './SplitList';

export const metadata = { title: 'Splits · Cleared' };

export default async function SplitsPage() {
  const { sb, memberships, name } = await requireSession();
  const [works, ws] = await Promise.all([
    sb.from('works').select(`${WORK_COLS}, recordings(id, title)`).order('created_at', { ascending: false }),
    sb.from('workspaces').select('id, name').order('name'),
  ]);
  const list = (works.data ?? []) as (Work & { recordings: { id: string; title: string }[] })[];
  const ags = list.length
    ? ((await sb.from('split_agreements').select(SUMMARY_SELECT).neq('status', 'void').in('work_id', list.map((w) => w.id))).data ?? []) as unknown as AgreementSummary[]
    : [];
  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <SplitList works={list} agreements={ags} workspaces={ws.data ?? []} memberships={memberships} />
      </main>
    </>
  );
}
