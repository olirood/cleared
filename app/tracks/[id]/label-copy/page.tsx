import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { composition } from '@/lib/composition';
import { CREDIT_COLS, LC_COLS, type Code, type Credit, type LCRecording } from '@/lib/labelcopy';
import TopBar from '../../../components/TopBar';
import LabelCopyEditor from './LabelCopyEditor';

export const metadata = { title: 'Label copy · Cleared' };

export default async function LabelCopyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { sb, memberships, name } = await requireSession();
  const { data: rec } = await sb.from('recordings').select(LC_COLS).eq('id', id).maybeSingle();
  if (!rec) notFound();
  const r = rec as LCRecording;
  const [ws, credits, codes, assets, people, comp] = await Promise.all([
    sb.from('workspaces').select('name').eq('id', r.workspace_id).single(),
    sb.from('credits').select(CREDIT_COLS).eq('recording_id', id).order('position'),
    sb.from('recording_codes').select('*').eq('recording_id', id),
    sb.from('assets').select('kind').eq('recording_id', id),
    sb.from('people').select('id, legal_name, credit_name, kinds, instruments').order('legal_name'),
    composition(sb, r.work_id),
  ]);
  const role = memberships.find((m) => m.workspace_id === r.workspace_id)?.role;
  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <LabelCopyEditor
          r={r} workspace={ws.data?.name ?? ''} credits={(credits.data ?? []) as unknown as Credit[]} codes={(codes.data ?? []) as Code[]}
          comp={comp.rows} splitState={comp.state} iswc={comp.iswc}
          hasMaster={(assets.data ?? []).some((a) => a.kind === 'master')} hasCover={(assets.data ?? []).some((a) => a.kind === 'cover')}
          people={(people.data ?? []) as { id: string; legal_name: string; credit_name: string | null; kinds: string[]; instruments: string | null }[]}
          canWrite={role === 'owner' || role === 'admin' || role === 'operator'} preparedBy={name}
        />
      </main>
    </>
  );
}
