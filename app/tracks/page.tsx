import { requireSession, signedUrls } from '@/lib/session';
import { ASSET_COLS, RECORDING_COLS, type Asset, type Recording, type WorkspaceLegal } from '@/lib/tracks';
import TopBar from '../components/TopBar';
import TrackList from './TrackList';

export const metadata = { title: 'Tracks · Cleared' };

export default async function TracksPage() {
  const { sb, memberships, name } = await requireSession();
  const mine = memberships.map((m) => m.workspace_id);
  const [ws, recs] = await Promise.all([
    sb.from('workspaces').select('id, name, label_handles_legal').in('id', mine.length ? mine : ['00000000-0000-0000-0000-000000000000']).order('name'),
    sb.from('recordings').select(RECORDING_COLS).order('release_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
  ]);
  const recordings = (recs.data ?? []) as Recording[];
  const assets = recordings.length
    ? ((await sb.from('assets').select(ASSET_COLS).in('recording_id', recordings.map((r) => r.id))).data ?? []) as Asset[]
    : [];
  const thumbs = await signedUrls(sb, assets.filter((a) => a.kind === 'cover').map((a) => a.thumb_key));

  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <TrackList recordings={recordings} assets={assets} thumbs={thumbs} workspaces={(ws.data ?? []) as WorkspaceLegal[]} memberships={memberships} />
      </main>
    </>
  );
}
