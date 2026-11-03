'use client';
import { useState, useTransition } from 'react';
import type { Work } from '@/lib/splits';
import { deleteWork, saveWork, type WorkInput } from './actions';

export default function WorkForm({ work, workspaces, canDelete, status, onSaved, onDeleted, onCancel }: {
  work?: Work; workspaces: { id: string; name: string }[]; canDelete?: boolean; status?: string;
  onSaved: (id: string) => void; onDeleted?: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState<WorkInput>({
    id: work?.id, workspace_id: work?.workspace_id ?? workspaces[0]?.id ?? '', title: work?.title ?? '', artist: work?.artist ?? '',
    session_with: work?.session_with ?? '', session_date: work?.session_date ?? (work ? '' : new Date().toISOString().slice(0, 10)),
    studio: work?.studio ?? '', notes: work?.notes ?? '',
  });
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof WorkInput, v: string) => setF((x) => ({ ...x, [k]: v }));
  const field = (k: keyof WorkInput, label: string, hint = '', type = 'text', cls = '') => (
    <label className={`f ${cls}`}><span>{label}{hint && <> <span className="hint">{hint}</span></>}</span>
      <input type={type} value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} autoFocus={k === 'title'} /></label>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await saveWork(f); if (r.error) setErr(r.error); else onSaved(r.id!); }); }}>
      <fieldset className="plain" disabled={pending}>
        <div className="grid2">
          {!work && workspaces.length > 1 && (
            <label className="f span2"><span>Espacio</span>
              <select value={f.workspace_id} onChange={(e) => set('workspace_id', e.target.value)}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
          )}
          {field('title', 'Título de la canción', '', 'text', 'span2')}
          {field('artist', 'Artista', 'como aparece en la carta')}
          {field('session_with', 'Sesión con', 'opcional')}
          {field('session_date', 'Fecha de la sesión', '', 'date')}
          {field('studio', 'Estudio', 'opcional')}
          <label className="f span2"><span>Notas <span className="hint">opcional</span></span>
            <textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        </div>
      </fieldset>
      {armed && status === 'sent' && <p className="small muted" style={{ marginTop: 12 }}>Los enlaces de firma dejan de servir y se borra el split con todas sus versiones. Quien ya firmó no recibe aviso.</p>}
      <p className="err" role="alert">{err}</p>
      <footer>
        {work && canDelete && status !== 'signed' ? <button type="button" className={`btn danger${armed ? ' armed' : ''}`} disabled={pending}
          onClick={() => { if (!armed) return setArmed(true); start(async () => { const r = await deleteWork(work.id); if (r.error) { setErr(r.error); setArmed(false); } else onDeleted?.(); }); }}>
          {armed ? (status === 'sent' ? 'Confirmar: cancelar firma y borrar' : 'Confirmar: borrar split') : status === 'sent' ? 'Cancelar firma y borrar' : 'Borrar split'}</button> : <span />}
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" disabled={pending}>{pending ? 'Guardando…' : work ? 'Guardar' : 'Crear split'}</button>
        </div>
      </footer>
    </form>
  );
}
