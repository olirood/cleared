'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { artistLine, checklist, fmtDate, missingOf, TRACK_TYPES, type Asset, type Recording, type SplitState, type WorkspaceLegal } from '@/lib/tracks';
import type { Member } from '@/lib/session';
import Panel from '../components/Panel';
import TrackForm from './TrackForm';

type Props = { recordings: Recording[]; assets: Asset[]; thumbs: Record<string, string>; workspaces: WorkspaceLegal[]; memberships: Member[]; splits: Record<string, SplitState>; labelCopy: Record<string, { ok: boolean; why: string }>; startCreating?: boolean };

export default function TrackList({ recordings, assets, thumbs, workspaces, memberships, splits, labelCopy, startCreating = false }: Props) {
  const router = useRouter();
  const [ws, setWs] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(startCreating);
  useEffect(() => { if (typeof window !== 'undefined' && window.location.search) window.history.replaceState(null, '', window.location.pathname); }, []);

  const writable = workspaces.filter((w) => memberships.some((m) => m.workspace_id === w.id && m.role !== 'viewer'));
  const wsOf = (id: string) => workspaces.find((w) => w.id === id);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return recordings.filter((r) => (!ws || r.workspace_id === ws) && (!n || [r.title, r.version_title, r.main_artist, r.featured_artists, r.release_title, r.isrc].join(' ').toLowerCase().includes(n)));
  }, [recordings, ws, q]);

  return (
    <div className="stack">
      <div className="row spread">
        <div><p className="eyebrow">Carpetas por canción</p><h1>Tracks</h1></div>
        {writable.length > 0 && <button className="btn primary" onClick={() => setCreating(true)}>Nuevo track</button>}
      </div>

      {recordings.length === 0 ? (
        <section className="card glass empty">
          <h2>Aún no hay tracks</h2>
          <p>Cada track es una carpeta: ficha, portada, enlaces al audio, documentos y después su split y label copy.</p>
          {writable.length > 0 && <button className="btn primary" onClick={() => setCreating(true)}>Nuevo track</button>}
        </section>
      ) : (
        <>
          <div className="toolbar">
            <input id="dir-q" type="search" placeholder="Buscar por título, artista, proyecto o ISRC" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar tracks" />
            {workspaces.length > 1 && (
              <div className="seg" role="group" aria-label="Filtrar por espacio">
                {[{ id: '', name: 'Todos' }, ...workspaces].map((w) => (
                  <button key={w.id} className="seg-b" aria-pressed={ws === w.id} onClick={() => setWs(w.id)}>
                    {w.name}<span className="n">{recordings.filter((r) => !w.id || r.workspace_id === w.id).length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="tracks glass" aria-label="Tracks">
            {list.map((r) => {
              const cover = assets.find((a) => a.recording_id === r.id && a.kind === 'cover');
              const miss = missingOf(checklist(r, assets, wsOf(r.workspace_id), r.work_id ? splits[r.work_id] : undefined, labelCopy[r.id]));
              return (
                <li key={r.id}>
                  <Link href={`/tracks/${r.id}`} className="trow-link">
                    <Thumb src={cover?.thumb_key ? thumbs[cover.thumb_key] : undefined} title={r.title} />
                    <div className="tmain">
                      <strong>{r.title}{r.version_title && <span className="muted"> ({r.version_title})</span>}</strong>
                      <div className="muted small">
                        {[artistLine(r), TRACK_TYPES[r.track_type], r.release_title?.trim().toLowerCase() !== r.title.trim().toLowerCase() && r.release_title].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="tmeta small">
                      {workspaces.length > 1 && <div>{wsOf(r.workspace_id)?.name}</div>}
                      <div className="muted">{r.release_date ? fmtDate(r.release_date) : 'Fecha pendiente'}</div>
                    </div>
                    <div className="tstate">
                      {miss.length ? <span className="pill crit">{miss.length === 1 ? `Falta ${miss[0].label.toLowerCase()}` : `Faltan ${miss.length}`}</span> : <span className="pill ok">Listo</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
            {list.length === 0 && <li className="muted" style={{ padding: 'var(--pad)' }}>Nada coincide con la búsqueda.</li>}
          </ul>
        </>
      )}

      {creating && (
        <Panel title="Nuevo track" onClose={() => setCreating(false)}>
          <TrackForm workspaces={writable} onCancel={() => setCreating(false)} onSaved={(id) => { setCreating(false); router.push(`/tracks/${id}`); }} />
        </Panel>
      )}
    </div>
  );
}

export function Thumb({ src, title, size = 52 }: { src?: string; title: string; size?: number }) {
  return src
    ? <img className="thumb" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="thumb blank" style={{ width: size, height: size }} aria-hidden="true">{title.trim()[0]?.toUpperCase() || '·'}</span>;
}
