'use client';
import { useState, useTransition } from 'react';
import { RELEASE_TYPES, TRACK_TYPES, type Recording } from '@/lib/tracks';
import { deleteTrack, saveTrack, type TrackInput } from './actions';

type Props = {
  track?: Recording;
  workspaces: { id: string; name: string }[];   // espacios donde puedo crear
  canDelete?: boolean;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
  onCancel: () => void;
};

export default function TrackForm({ track, workspaces, canDelete, onSaved, onDeleted, onCancel }: Props) {
  const [f, setF] = useState<TrackInput>({
    id: track?.id,
    workspace_id: track?.workspace_id ?? workspaces[0]?.id ?? '',
    title: track?.title ?? '',
    version_title: track?.version_title ?? '',
    main_artist: track?.main_artist ?? '',
    featured_artists: track?.featured_artists ?? '',
    track_type: track?.track_type ?? 'single',
    release_title: track?.release_title ?? '',
    release_type: track?.release_type ?? '',
    release_date: track?.release_date ?? '',
    isrc: track?.isrc ?? '',
  });
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof TrackInput, v: string) => setF((x) => ({ ...x, [k]: v }));
  const field = (k: keyof TrackInput, label: string, hint = '', type = 'text', cls = '') => (
    <label className={`f ${cls}`}>
      <span>{label}{hint && <> <span className="hint">{hint}</span></>}</span>
      <input type={type} value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} autoFocus={k === 'title'} />
    </label>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    start(async () => {
      const r = await saveTrack(f);
      if (r.error) setErr(r.error); else onSaved(r.id!);
    });
  };
  const remove = () => {
    if (!track) return;
    if (!armed) { setArmed(true); return; }
    start(async () => {
      const r = await deleteTrack(track.id);
      if (r.error) { setErr(r.error); setArmed(false); } else onDeleted?.();
    });
  };

  return (
    <form onSubmit={submit}>
      <fieldset className="plain" disabled={pending}>
        <div className="grid2">
          {!track && workspaces.length > 1 && (
            <label className="f span2"><span>Espacio</span>
              <select value={f.workspace_id} onChange={(e) => set('workspace_id', e.target.value)}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          {field('title', 'Título', '', 'text', 'span2')}
          {field('main_artist', 'Artista principal')}
          {field('featured_artists', 'Artistas invitados', 'separados con ;')}
          {field('version_title', 'Versión', 'ej. Acústica, Remix, En vivo')}
          <label className="f"><span>Tipo de track</span>
            <select value={f.track_type} onChange={(e) => set('track_type', e.target.value)}>
              {Object.entries(TRACK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {field('release_title', 'Proyecto', 'nombre del sencillo, EP o álbum')}
          <label className="f"><span>Formato</span>
            <select value={f.release_type} onChange={(e) => set('release_type', e.target.value)}>
              <option value="">Elegir…</option>
              {RELEASE_TYPES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          {field('release_date', 'Fecha de lanzamiento', '', 'date')}
          {field('isrc', 'ISRC', 'opcional')}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>El tipo arma el checklist: un feat pide waiver del invitado; un cover o remix, licencia.</p>
      </fieldset>
      <p className="err" role="alert">{err}</p>
      <footer>
        {track && canDelete ? (
          <button type="button" className={`btn danger${armed ? ' armed' : ''}`} onClick={remove} disabled={pending}>{armed ? 'Confirmar: borrar track y archivos' : 'Borrar track'}</button>
        ) : <span />}
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={pending}>{pending ? 'Guardando…' : track ? 'Guardar' : 'Crear track'}</button>
        </div>
      </footer>
    </form>
  );
}
