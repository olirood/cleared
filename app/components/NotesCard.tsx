'use client';
// Mis pendientes: anotar rápido, palomear, borrar. Se ve al instante y se guarda atrás.
import { useOptimistic, useState, useTransition } from 'react';
import { addNote, clearDone, deleteNote, toggleNote } from '../notes-actions';

export type Note = { id: string; body: string; due_on: string | null; done_at: string | null; created_at: string };
type Op = { t: 'add'; n: Note } | { t: 'toggle'; id: string; done: boolean } | { t: 'del'; id: string } | { t: 'clear' };

const dueLabel = (d: string, today: string) => {
  const n = Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
  if (n < 0) return { text: n === -1 ? 'Ayer' : `Hace ${-n} días`, tone: 'crit' };
  if (n === 0) return { text: 'Hoy', tone: 'warn' };
  if (n === 1) return { text: 'Mañana', tone: 'warn' };
  return { text: new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), tone: '' };
};

export default function NotesCard({ notes, today, ready }: { notes: Note[]; today: string; ready: boolean }) {
  const [list, apply] = useOptimistic(notes, (cur: Note[], op: Op) =>
    op.t === 'add' ? [...cur, op.n]
      : op.t === 'toggle' ? cur.map((n) => (n.id === op.id ? { ...n, done_at: op.done ? new Date().toISOString() : null } : n))
        : op.t === 'del' ? cur.filter((n) => n.id !== op.id)
          : cur.filter((n) => !n.done_at));
  const [, start] = useTransition();
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState('');
  const run = (op: Op, fn: () => Promise<{ error?: string }>) => start(async () => { apply(op); setErr(''); const r = await fn(); if (r.error) setErr(r.error); });

  // primero lo que tiene fecha (lo más cercano arriba), luego lo demás por orden de alta
  const open = list.filter((n) => !n.done_at).sort((a, b) => (a.due_on && b.due_on ? a.due_on.localeCompare(b.due_on) : a.due_on ? -1 : b.due_on ? 1 : a.created_at.localeCompare(b.created_at)));
  const done = list.filter((n) => n.done_at);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const n: Note = { id: 'tmp-' + Date.now(), body, due_on: due || null, done_at: null, created_at: new Date().toISOString() };
    setText(''); setDue(''); setShowDate(false);
    run({ t: 'add', n }, () => addNote(body, n.due_on));
  };

  return (
    <section className="card glass notes">
      <header><h2>Mis pendientes</h2>{open.length > 0 && <span className="pill">{open.length}</span>}</header>
      {!ready ? <p className="muted small">Falta correr la migración de notas en Supabase para usar esta sección.</p> : (
        <>
          <form className="note-add" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <input type="text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Anota algo… (Enter para guardar)" aria-label="Nuevo pendiente" />
            {showDate
              ? <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Para cuándo" className="note-date" />
              : <button type="button" className="icon-btn" title="Ponerle fecha" aria-label="Ponerle fecha" onClick={() => setShowDate(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></button>}
            <button className="btn small primary" disabled={!text.trim()}>Agregar</button>
          </form>
          {err && <p className="form-msg crit" role="alert">{err}</p>}
          {open.length === 0 && <p className="muted small" style={{ margin: '4px 0 0' }}>Sin pendientes. Anota lo que no quieras olvidar: llamadas, correos, ideas.</p>}
          <ul className="note-list">
            {open.map((n) => {
              const d = n.due_on ? dueLabel(n.due_on, today) : null;
              return (
                <li key={n.id}>
                  <input type="checkbox" checked={false} aria-label={`Marcar “${n.body}” como hecho`} onChange={() => run({ t: 'toggle', id: n.id, done: true }, () => toggleNote(n.id, true))} disabled={n.id.startsWith('tmp-')} />
                  <span className="note-body">{n.body}</span>
                  {d && <span className={`note-due ${d.tone}`}>{d.text}</span>}
                  <button type="button" className="icon-btn note-x" aria-label="Borrar" onClick={() => run({ t: 'del', id: n.id }, () => deleteNote(n.id))} disabled={n.id.startsWith('tmp-')}>×</button>
                </li>
              );
            })}
          </ul>
          {done.length > 0 && (
            <div className="note-done">
              <button type="button" className="linkish small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Ocultar' : 'Ver'} {done.length === 1 ? '1 hecho' : `${done.length} hechos`}</button>
              {showDone && (
                <>
                  <ul className="note-list done">
                    {done.map((n) => (
                      <li key={n.id}>
                        <input type="checkbox" checked aria-label={`Regresar “${n.body}” a pendientes`} onChange={() => run({ t: 'toggle', id: n.id, done: false }, () => toggleNote(n.id, false))} />
                        <span className="note-body">{n.body}</span>
                        <button type="button" className="icon-btn note-x" aria-label="Borrar" onClick={() => run({ t: 'del', id: n.id }, () => deleteNote(n.id))}>×</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="linkish small" onClick={() => run({ t: 'clear' }, clearDone)}>Borrar los hechos</button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
