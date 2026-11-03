'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { KINDS, NATIONALITIES, PHONE_COUNTRIES, PROS, canWriteRole, kindLabel, missing, normName, cleanIpi, joinPhone, splitPhone, type Membership, type Person, type Workspace } from '@/lib/people';
import { repFor, repLabel, type Rep } from '@/lib/reps';
import { deletePerson, savePerson, type PersonInput } from './actions';

type Props = { people: Person[]; workspaces: Workspace[]; memberships: Membership[]; reps: Rep[]; startOpen?: string | null };

export default function Directory({ people, workspaces, memberships, reps, startOpen = null }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<Person | 'new' | null>(() => startOpen === 'new' ? 'new' : startOpen ? people.find((p) => p.id === startOpen) ?? null : null);
  useEffect(() => { if (typeof window !== 'undefined' && window.location.search) window.history.replaceState(null, '', window.location.pathname); }, []);

  const [toast, setToast] = useState('');

  const wsName = (id: string | null) => workspaces.find((w) => w.id === id)?.name ?? '';
  const roleIn = (id: string | null) => memberships.find((m) => m.workspace_id === id)?.role;
  const mine = (p: Person) => !!roleIn(p.owner_workspace_id);
  const writable = memberships.filter((m) => canWriteRole(m.role));

  const list = useMemo(() => {
    const n = normName(q);
    return people.filter((p) => (!kind || p.kinds.includes(kind)) && (!n || normName(
      [p.legal_name, p.credit_name, p.ipi, p.publishers?.name, p.pro, p.instruments, p.email].filter(Boolean).join(' '),
    ).includes(n)));
  }, [people, q, kind]);
  const count = (k: string) => people.filter((p) => !k || p.kinds.includes(k)).length;

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2400); return () => clearTimeout(id); }, [toast]);

  const done = (msg: string) => { setOpen(null); setToast(msg); router.refresh(); };

  return (
    <div className="stack">
      <div className="row spread">
        <div><p className="eyebrow">Personas · compartido entre espacios</p><h1>Directorio</h1></div>
        {writable.length > 0 && <button className="btn primary" onClick={() => setOpen('new')}>Nuevo perfil</button>}
      </div>

      {people.length === 0 ? (
        <section className="card glass empty">
          <h2>El directorio está vacío</h2>
          <p>Aquí viven compositores, productores, ingenieros, músicos y gente de arte y video. Se capturan una vez y llenan splits y label copy en todos los espacios.</p>
          {writable.length > 0 && <button className="btn primary" onClick={() => setOpen('new')}>Nuevo perfil</button>}
        </section>
      ) : (
        <>
          <div className="toolbar">
            <input id="dir-q" type="search" placeholder="Buscar por nombre, IPI, editora o instrumento" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el directorio" />
            <div className="seg" role="group" aria-label="Filtrar por tipo">
              {[['', 'Todos'] as const, ...KINDS].map(([k, label]) => (
                <button key={k} className="seg-b" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}<span className="n">{count(k)}</span></button>
              ))}
            </div>
          </div>
          <div className="tablewrap dirtable glass">
            <table>
              <thead><tr><th>Nombre</th><th>Hace</th><th>Datos editoriales</th><th>Contacto</th><th>Estado</th></tr></thead>
              <tbody>
                {list.map((p) => {
                  const m = missing(p);
                  const sub = [p.credit_name, !mine(p) ? `De ${repLabel(reps, p.owner_workspace_id, wsName(p.owner_workspace_id))}` : '', !p.shared ? 'Solo su espacio' : ''].filter(Boolean).join(' · ');
                  return (
                    <tr key={p.id} tabIndex={0} onClick={() => setOpen(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(p); } }}>
                      <td>
                        <strong>{p.legal_name}</strong>
                        {sub && <div className="muted small">{sub}</div>}
                        {p.represented_by && <div className="small" style={{ marginTop: 4 }}>Lo representa {repLabel(reps, p.represented_by, wsName(p.represented_by))}</div>}
                      </td>
                      <td>
                        <div className="tags">{p.kinds.map((k) => <span key={k} className="pill">{kindLabel(k)}</span>)}</div>
                        {p.instruments && <div className="muted small" style={{ marginTop: 4 }}>{p.instruments}</div>}
                      </td>
                      <td>
                        {p.kinds.includes('songwriter') ? (
                          <>{p.pro || '—'}{p.ipi && <> · <span className="mono nowrap">IPI {p.ipi}</span></>}<div className="muted small">{p.publishers?.name || 'Sin editora'}</div></>
                        ) : <span className="muted hide-m">No aplica</span>}
                      </td>
                      <td className="small">{p.email || <span className="muted hide-m">—</span>}{p.phone && <div className="muted">{p.phone}</div>}</td>
                      <td>{m.length ? <span className="pill crit">Falta {m.join(', ')}</span> : <span className="pill ok">Completo</span>}</td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={5} className="muted">Nada coincide con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <ProfilePanel
          key={open === 'new' ? 'new' : open.id}
          person={open === 'new' ? null : open}
          people={people}
          workspaces={workspaces}
          memberships={memberships}
          reps={reps}
          onClose={() => setOpen(null)}
          onOpen={(p) => setOpen(p)}
          onDone={done}
        />
      )}
      {toast && createPortal(<div className="toast" role="status">{toast}</div>, document.body)}
    </div>
  );
}

export function ProfilePanel({ person, people, workspaces, memberships, onClose, onOpen, onDone, preset, reps }: {
  person: Person | null; people: Person[]; workspaces: Workspace[]; memberships: Membership[]; reps?: Rep[];
  onClose: () => void; onOpen: (p: Person) => void; onDone: (msg: string, id?: string) => void; preset?: string[];
}) {
  const roleIn = (id: string | null) => memberships.find((m) => m.workspace_id === id)?.role;
  const writable = memberships.filter((m) => canWriteRole(m.role));
  const wsName = (id: string | null) => workspaces.find((w) => w.id === id)?.name ?? '';
  const canEdit = !person || canWriteRole(roleIn(person.owner_workspace_id)) || canWriteRole(roleIn(person.represented_by));
  const canDelete = !!person && ['owner', 'admin'].includes(roleIn(person.owner_workspace_id) ?? '');
  const admin = person ? (reps ? repLabel(reps, person.represented_by || person.owner_workspace_id, wsName(person.represented_by || person.owner_workspace_id)) : wsName(person.represented_by || person.owner_workspace_id)) : '';

  const [f, setF] = useState<PersonInput>(() => ({
    id: person?.id,
    owner_workspace_id: person?.owner_workspace_id ?? writable[0]?.workspace_id ?? '',
    represented_by: person?.represented_by ?? '',
    shared: person?.shared ?? true,
    legal_name: person?.legal_name ?? '',
    credit_name: person?.credit_name ?? '',
    nationality: person?.nationality ?? '',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
    kinds: person?.kinds ?? preset ?? ['songwriter'],
    instruments: person?.instruments ?? '',
    isni: person?.isni ?? '',
    pro: person?.pro ?? '',
    pro_member_no: person?.pro_member_no ?? '',
    ipi: person?.ipi ?? '',
    publisher_name: person?.publishers?.name ?? '',
    publisher_ipi: person?.publishers?.ipi ?? '',
    publisher_email: person?.publishers?.email ?? '',
  }));
  const [err, setErr] = useState('');
  const [dup, setDup] = useState<{ p: Person; why: string } | null>(null);
  const [force, setForce] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleKind = (k: string) => set('kinds', f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setErr(''); setDup(null);
    if (!person && !force) {
      const ipi = cleanIpi(f.ipi), mail = f.email.trim().toLowerCase(), name = normName(f.legal_name);
      const hit = people.find((x) => (ipi && x.ipi === ipi) || (mail && x.email?.toLowerCase() === mail) || normName(x.legal_name) === name);
      if (hit) {
        const why = ipi && hit.ipi === ipi ? 'con el mismo IPI' : mail && hit.email?.toLowerCase() === mail ? 'con el mismo correo' : 'con el mismo nombre';
        setDup({ p: hit, why });
        return;
      }
    }
    start(async () => {
      const r = await savePerson(f);
      if (r.error) setErr(r.error); else onDone('Perfil guardado', r.id);
    });
  };

  const remove = () => {
    if (!person) return;
    if (!armed) { setArmed(true); return; }
    start(async () => {
      const r = await deletePerson(person.id);
      if (r.error) { setErr(r.error); setArmed(false); } else onDone('Perfil eliminado');
    });
  };

  const field = (k: keyof PersonInput, label: string, hint = '', type = 'text', cls = '', req = false) => (
    <label className={`f ${cls}`}>
      <span>{label}{req && <span className="req" aria-hidden="true"> *</span>}{hint && <> <span className="hint">{hint}</span></>}</span>
      <input ref={k === 'legal_name' ? first : undefined} type={type} value={String(f[k] ?? '')} required={req} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );
  const songwriter = f.kinds.includes('songwriter');
  const showIsni = f.kinds.some((k) => ['artist', 'producer', 'engineer', 'musician'].includes(k)) || !!f.isni;
  const phone = splitPhone(f.phone);
  const setPhone = (country: string, number: string) => set('phone', joinPhone(country, number) || (number ? number : ''));
  const repList: Rep[] = reps ?? workspaces.map((w) => ({ key: w.id, label: w.name, ids: [w.id], users: [] }));
  const others = workspaces.map((w) => w.name).join(', ');

  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby="pf-title">
        <form onSubmit={submit}>
          <header>
            <h2 id="pf-title">{!canEdit ? 'Perfil' : person ? 'Editar perfil' : 'Nuevo perfil'}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
          </header>
          {!canEdit && (
            <div className="banner info" style={{ marginBottom: 16 }}>
              <span>Este perfil lo administra <b>{admin}</b>. Puedes usarlo en tus splits y label copies, pero solo ellos lo editan.</span>
            </div>
          )}
          <fieldset className="plain" disabled={!canEdit || pending}>
            <div className="stack">
              {/* solo si sus espacios los operan personas distintas; si es la misma gente (Kevin y Octavio = Oliver) da igual cuál */}
              {!person && writable.length > 1 && !repList.some((r) => writable.every((m) => r.ids.includes(m.workspace_id))) && (
                <label className="f"><span>Lo das de alta en <span className="hint">tu espacio que lo administra</span></span>
                  <select value={f.owner_workspace_id} onChange={(e) => set('owner_workspace_id', e.target.value)}>
                    {writable.map((m) => <option key={m.workspace_id} value={m.workspace_id}>{wsName(m.workspace_id)}</option>)}
                  </select>
                </label>
              )}
              <fieldset><legend>Persona</legend><div className="grid2">
                {field('legal_name', 'Nombre legal', 'como en su INE', 'text', 'span2', true)}
                {field('credit_name', 'Nombre en créditos', 'artístico')}
                <label className="f"><span>Nacionalidad</span>
                  <select value={NATIONALITIES.includes(f.nationality) || !f.nationality ? f.nationality : '__other'}
                    onChange={(e) => set('nationality', e.target.value === '__other' ? ' ' : e.target.value)}>
                    <option value="">Elegir…</option>
                    {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
                    <option value="__other">Otra…</option>
                  </select>
                  {f.nationality && !NATIONALITIES.includes(f.nationality) && (
                    <input type="text" className="nat-other" value={f.nationality.trim()} placeholder="Escribe la nacionalidad" onChange={(e) => set('nationality', e.target.value || ' ')} />
                  )}
                </label>
                {field('email', 'Correo', songwriter ? 'ahí le llega su código para firmar' : '', 'email', '', songwriter)}
                <label className="f"><span>WhatsApp</span>
                  <span className="phone">
                    <select value={phone.country} aria-label="Lada del país" onChange={(e) => setPhone(e.target.value, phone.number)}>
                      {PHONE_COUNTRIES.filter(([c]) => !['DO', 'PR', 'CA'].includes(c)).map(([c, flag, code]) => <option key={c} value={c}>{flag} {code}</option>)}
                    </select>
                    <input type="tel" value={phone.number} placeholder="55 1234 5678" onChange={(e) => setPhone(phone.country, e.target.value)} />
                  </span>
                </label>
              </div></fieldset>
              <fieldset><legend>Qué hace <span className="req" aria-hidden="true">*</span></legend>
                <div className="chips">
                  {KINDS.map(([k, label]) => (
                    <label key={k} className="chip"><input type="checkbox" checked={f.kinds.includes(k)} onChange={() => toggleKind(k)} /><span>{label}</span></label>
                  ))}
                </div>
                {(f.kinds.includes('musician') || showIsni) && (
                  <div className="grid2" style={{ marginTop: 12 }}>
                    {f.kinds.includes('musician') && field('instruments', 'Instrumentos', 'ej. Requinto, bajo sexto')}
                    {showIsni && field('isni', 'ISNI', 'opcional, 16 dígitos')}
                  </div>
                )}
              </fieldset>
              {songwriter && (
                <fieldset><legend>Datos editoriales</legend><div className="grid2">
                  <label className="f"><span>Sociedad de gestión <span className="req" aria-hidden="true">*</span></span>
                    <select value={f.pro} onChange={(e) => set('pro', e.target.value)} required>
                      <option value="">Elegir…</option>
                      {PROS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                  {field('pro_member_no', 'Número de socio', 'opcional')}
                  {field('ipi', 'IPI', f.pro && f.pro !== 'Ninguna' ? '9 a 11 dígitos · lo pide el split' : '9 a 11 dígitos')}
                  <span />
                  {field('publisher_name', 'Editora', 'vacío si no tiene')}
                  {f.publisher_name.trim() && field('publisher_ipi', 'IPI de la editora')}
                  {f.publisher_name.trim() && field('publisher_email', 'Correo de la editora', 'para licencias y regalías', 'email', 'span2')}
                </div></fieldset>
              )}
              <fieldset><legend>Representación</legend><div className="grid2">
                <label className="f"><span>Lo representa <span className="hint">en la plataforma</span></span>
                  <select value={repFor(repList, f.represented_by)?.key ?? ''}
                    onChange={(e) => {
                      const r = repList.find((x) => x.key === e.target.value);
                      set('represented_by', r ? (r.ids.includes(f.owner_workspace_id) ? f.owner_workspace_id : r.ids[0]) : '');
                    }}>
                    <option value="">Nadie, o alguien fuera de la plataforma</option>
                    {repList.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </label>
                <p className="muted small" style={{ alignSelf: 'end' }}>Si alguien más lo pone en un split, quien lo representa lo ve y aprueba su parte antes de mandarlo a firma.</p>
              </div></fieldset>
              <label className="row share">
                <input type="checkbox" checked={f.shared} onChange={(e) => set('shared', e.target.checked)} />
                <span className="small"><b>Compartir con otros espacios.</b> {others} usan el mismo perfil sin volver a capturarlo.{person && !roleIn(person.owner_workspace_id) ? ` Lo agregó ${wsName(person.owner_workspace_id)}.` : ''}</span>
              </label>
            </div>
          </fieldset>

          <div className="err" role="alert">
            {err}
            {dup && (
              <>
                Ya existe <b>{dup.p.legal_name}</b> {dup.why}{!roleIn(dup.p.owner_workspace_id) ? ` (lo agregó ${wsName(dup.p.owner_workspace_id)})` : ''}.
                <span className="row">
                  <button type="button" className="btn small primary" onClick={() => onOpen(dup.p)}>Usar ese perfil</button>
                  <button type="button" className="btn small" onClick={() => { setForce(true); setDup(null); }}>Es otra persona: crear</button>
                </span>
              </>
            )}
          </div>

          <footer>
            {!canEdit ? <span /> : canDelete ? (
              <button type="button" className={`btn danger${armed ? ' armed' : ''}`} onClick={remove} disabled={pending}>{armed ? 'Confirmar: eliminar' : 'Eliminar perfil'}</button>
            ) : <span />}
            <div className="row">
              {canEdit ? (
                <>
                  <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                  <button type="submit" className="btn primary" disabled={pending}>{pending ? 'Guardando…' : force ? 'Crear de todos modos' : 'Guardar perfil'}</button>
                </>
              ) : <button type="button" className="btn primary" onClick={onClose}>Cerrar</button>}
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
