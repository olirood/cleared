'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Work } from '@/lib/splits';
import { summarize, type AgreementSummary } from '@/lib/splitStatus';
import { fmtDate } from '@/lib/tracks';
import type { Member } from '@/lib/session';
import type { Rep } from '@/lib/reps';
import Panel from '../components/Panel';
import WorkForm from './WorkForm';

type W = Work & { recordings: { id: string; title: string }[] };

export default function SplitList({ works, agreements, workspaces, memberships, reps, startCreating = false }: { works: W[]; agreements: AgreementSummary[]; workspaces: { id: string; name: string }[]; memberships: Member[]; reps: Rep[]; startCreating?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(startCreating);
  useEffect(() => { if (typeof window !== 'undefined' && window.location.search) window.history.replaceState(null, '', window.location.pathname); }, []);

  const mine = new Set(memberships.map((m) => m.workspace_id));
  const writable = workspaces.filter((w) => memberships.some((m) => m.workspace_id === w.id && m.role !== 'viewer'));
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? '';

  const rows = useMemo(() => works.map((w) => {
    const a = agreements.find((x) => x.work_id === w.id);
    const s = summarize(a, w.workspace_id, reps);
    const external = !mine.has(w.workspace_id);
    const myTurn = s.reps.some((r) => mine.has(r.ws) && r.state !== 'ok') && a?.status === 'draft';
    return { w, s, external, myTurn };
  }), [works, agreements]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = [
    { id: '', label: 'Todos', n: rows.length },
    ...workspaces.filter((w) => mine.has(w.id)).map((w) => ({ id: w.id, label: w.name, n: rows.filter((r) => r.w.workspace_id === w.id).length })),
    ...(rows.some((r) => r.external) ? [{ id: 'ext', label: 'De otros espacios', n: rows.filter((r) => r.external).length }] : []),
  ];
  const n = q.trim().toLowerCase();
  const list = rows.filter((r) => (!filter || (filter === 'ext' ? r.external : r.w.workspace_id === filter))
    && (!n || [r.w.title, r.w.artist, r.w.session_with, r.w.studio].join(' ').toLowerCase().includes(n)));

  return (
    <div className="stack">
      <div className="row spread">
        <div><p className="eyebrow">Splits de obra · por track o de sesión</p><h1>Splits</h1></div>
        {writable.length > 0 && <button className="btn primary" onClick={() => setCreating(true)}>Nuevo split de sesión</button>}
      </div>
      {rows.some((r) => r.myTurn) && (
        <div className="banner warn"><span><b>Te toca aprobar.</b> Hay splits de otros espacios con personas que tú representas.</span>
          <button className="btn small" onClick={() => setFilter('ext')}>Ver</button></div>
      )}
      {works.length === 0 ? (
        <section className="card glass empty">
          <h2>Aún no hay splits</h2>
          <p>Crea un split de sesión cuando escriben una canción sin track todavía, o ábrelo desde la carpeta de un track.</p>
          {writable.length > 0 && <button className="btn primary" onClick={() => setCreating(true)}>Nuevo split de sesión</button>}
        </section>
      ) : (
        <>
          <div className="toolbar">
            <input id="dir-q" type="search" placeholder="Buscar por título, artista, sesión o estudio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar splits" />
            {filters.length > 2 && (
              <div className="seg" role="group" aria-label="Filtrar">
                {filters.map((f) => <button key={f.id} className="seg-b" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}<span className="n">{f.n}</span></button>)}
              </div>
            )}
          </div>
          <ul className="tracks glass">
            {list.map(({ w, s, external, myTurn }) => (
              <li key={w.id}>
                <Link href={`/splits/${w.id}`} className="trow-link">
                  <span className="thumb blank" style={{ width: 44, height: 44 }} aria-hidden="true">{w.title.trim()[0]?.toUpperCase()}</span>
                  <div className="tmain">
                    <strong>{w.title}</strong>
                    <div className="muted small">{[w.artist, w.session_with && `Sesión con ${w.session_with}`, w.recordings?.length ? `Track: ${w.recordings.map((r) => r.title).join(', ')}` : !external && 'Sin track'].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="tmeta small">
                    <div>{external ? `De ${wsName(w.workspace_id)}` : workspaces.length > 1 ? wsName(w.workspace_id) : ''}</div>
                    <div className="muted">{w.session_date ? fmtDate(w.session_date) : ''}</div>
                  </div>
                  <div className="tstate">{myTurn ? <span className="pill warn">Te toca aprobar</span> : <span className={`pill ${s.tone}`}>{s.label}</span>}</div>
                </Link>
              </li>
            ))}
            {list.length === 0 && <li className="muted" style={{ padding: 'var(--pad)' }}>Nada coincide.</li>}
          </ul>
        </>
      )}
      {creating && (
        <Panel title="Nuevo split de sesión" onClose={() => setCreating(false)}>
          <WorkForm workspaces={writable} onCancel={() => setCreating(false)} onSaved={(id) => { setCreating(false); router.push(`/splits/${id}`); }} />
        </Panel>
      )}
    </div>
  );
}
