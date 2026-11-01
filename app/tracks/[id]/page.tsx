import { notFound } from 'next/navigation';
import { requireSession, signedUrls } from '@/lib/session';
import { labelCopyStates, splitStates } from '@/lib/composition';
import { ASSET_COLS, RECORDING_COLS, type Asset, type Recording, type WorkspaceLegal } from '@/lib/tracks';
import TopBar from '../../components/TopBar';
import Folder from './Folder';

export const metadata = { title: 'Track · Cleared' };

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { sb, memberships, name } = await requireSession();
  const { data: rec } = await sb.from('recordings').select(RECORDING_COLS).eq('id', id).maybeSingle();
  if (!rec) notFound();
  const r = rec as Recording;
  const [ws, as] = await Promise.all([
    sb.from('workspaces').select('id, name, label_handles_legal').eq('id', r.workspace_id).single(),
    sb.from('assets').select(ASSET_COLS).eq('recording_id', id).order('created_at'),
  ]);
  const assets = (as.data ?? []) as Asset[];
  const urls = await signedUrls(sb, assets.flatMap((a) => [a.storage_key, a.thumb_key]));
  const role = memberships.find((m) => m.workspace_id === r.workspace_id)?.role;
  const [splits, lc, sessions] = await Promise.all([
    splitStates(sb, r.work_id ? [{ id: r.work_id, workspace_id: r.workspace_id }] : []),
    labelCopyStates(sb, [r.id], { [r.id]: r.work_id }),
    r.work_id ? Promise.resolve({ data: [] }) : sb.from('works').select('id, title, session_date, recordings(id)').eq('workspace_id', r.workspace_id).order('created_at', { ascending: false }),
  ]);
  const freeSessions = ((sessions.data ?? []) as { id: string; title: string; session_date: string | null; recordings: { id: string }[] }[])
    .filter((w) => !w.recordings?.length).map((w) => ({ id: w.id, title: w.title, session_date: w.session_date }));

  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <Folder
          track={r}
          workspace={ws.data as WorkspaceLegal}
          assets={assets}
          urls={urls}
          canWrite={role === 'owner' || role === 'admin' || role === 'operator'}
          canDelete={role === 'owner' || role === 'admin'}
          split={r.work_id ? splits[r.work_id] : undefined}
          labelCopy={lc[r.id]}
          sessions={freeSessions}
        />
      </main>
    </>
  );
}
