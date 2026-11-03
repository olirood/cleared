'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EXPLICIT, INSTRUMENTS, LANGS, PERF_TYPES, PROD_ROLES, SECTIONS, STUDIO_ROLES, SUGGESTED, VIS_ROLES,
  buildDoc, fmtDuration, lcPdf, lcXlsx, type Code, type CompRow, type Credit, type LCDoc, type LCRecording,
} from '@/lib/labelcopy';
import { downloadBlob, fileSafe } from '@/lib/letter';
import Panel, { Toast } from '../../../components/Panel';
import { addCreditFull, removeCredit, saveLabelCopy, type LCInput } from './actions';

type P = { id: string; legal_name: string; credit_name: string | null; kinds: string[]; instruments: string | null };
type Props = {
  r: LCRecording; workspace: string; credits: Credit[]; codes: Code[]; comp: CompRow[]; splitState: string; iswc: string | null;
  hasMaster: boolean; hasCover: boolean; people: P[]; canWrite: boolean; preparedBy: string;
};

export default function LabelCopyEditor(props: Props) {
  const { r, workspace, credits, codes, comp, splitState, iswc, hasMaster, hasCover, people, canWrite, preparedBy } = props;
  const router = useRouter();
  const [toast, setToast] = useState('');
  const [busy, start] = useTransition();
  const [preview, setPreview] = useState(false);
  const year = (r.release_date || new Date().toISOString()).slice(0, 4);
  const [f, setF] = useState<LCInput>({
    label_name: r.label_name ?? '', distributor: r.distributor ?? '', upc: r.upc ?? '', genre: r.genre ?? '', explicit: r.explicit, language: r.language ?? 'spa',
    duration: fmtDuration(r.duration_s), p_year: String(r.p_year ?? year), p_owner: r.p_owner ?? '', c_year: String(r.c_year ?? year), c_owner: r.c_owner ?? '',
    delivery_contact: r.delivery_contact ?? '', iswc: iswc ?? '',
  });
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);
  const set = (k: keyof LCInput, v: string) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };
  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => start(async () => {
    const res = await fn(); setToast(res.error || ok); if (!res.error) { after?.(); router.refresh(); }
  });

  const doc: LCDoc = buildDoc({ workspace, r, iswc, credits, codes, comp, splitState, hasMaster, hasCover, preparedBy });
  const out = (kind: 'pdf' | 'xlsx') => start(async () => {
    try {
      const blob = kind === 'pdf' ? await lcPdf(doc) : await lcXlsx(doc);
      downloadBlob(blob, `Label copy ${fileSafe(r.title)}${r.version_title ? ' ' + fileSafe(r.version_title) : ''}.${kind}`);
    } catch { setToast('No se pudo generar el archivo.'); }
  });

  const field = (k: keyof LCInput, label: string, hint = '', cls = '', ph = '') => (
    <label className={`f ${cls}`}><span>{label}{hint && <> <span className="hint">{hint}</span></>}</span>
      <input type="text" value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></label>
  );

  return (
    <div className="stack">
      <Link href={`/tracks/${r.id}`} className="small back">← {r.title}</Link>
      <div className="row spread">
        <div>
          <p className="eyebrow">Label copy · {workspace}</p>
          <h1>{r.title}{r.version_title && <span className="muted"> ({r.version_title})</span>}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            {doc.missing.length ? <span className="pill crit">Falta {doc.missing.join(', ')}</span> : <span className="pill ok">Completo</span>}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPreview(true)}>Vista previa</button>
          <button className="btn" onClick={() => out('xlsx')} disabled={busy}>Excel</button>
          <button className="btn primary" onClick={() => out('pdf')} disabled={busy}>PDF</button>
        </div>
      </div>

      <section className="card glass">
        <header><h2>Lanzamiento y track</h2><span className="muted small">Título, artista, fecha, ISRC y proyecto se editan en la <Link href={`/tracks/${r.id}`}>ficha del track</Link></span></header>
        <form onSubmit={(e) => { e.preventDefault(); run(() => saveLabelCopy(r.id, f), 'Guardado', () => setDirty(false)); }}>
          <fieldset className="plain" disabled={!canWrite || busy}>
            <div className="grid3">
              {field('label_name', 'Sello', '', '', 'ej. Fonovisa, o Independiente')}
              {field('distributor', 'Distribuidora', '', '', 'ej. Universal Music, ONErpm')}
              {field('upc', 'UPC', 'código del lanzamiento, opcional')}
              {field('genre', 'Género')}
              <label className="f"><span>Contenido</span>
                <select value={f.explicit} onChange={(e) => set('explicit', e.target.value)}>{Object.entries(EXPLICIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="f"><span>Idioma</span>
                <select value={f.language} onChange={(e) => set('language', e.target.value)}>{LANGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              {field('duration', 'Duración', 'min:seg', '', '3:24')}
              {field('iswc', 'ISWC', r.work_id ? 'código de la canción, opcional' : 'crea el split primero', '', 'T-123.456.789-0')}
            </div>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="pline">{field('p_year', '℗ Año')}{field('p_owner', 'Dueño de la grabación', 'línea ℗', '', 'ej. Kevin Cuadras')}</div>
              <div className="pline">{field('c_year', '© Año')}{field('c_owner', 'Dueño del lanzamiento', 'línea ©, si es otro', '', f.p_owner || 'igual que ℗')}</div>
            </div>
          </fieldset>
          {canWrite && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn primary" disabled={busy || !dirty}>Guardar</button></div>}
        </form>
      </section>

      <section className="card glass">
        <header><h2>Composición</h2><span className="pill">{splitState}</span></header>
        {comp.length ? (
          <ul className="files">
            {comp.map((c, i) => <li key={i}><span className="mono small">{(c.share_bp / 100).toFixed(2).replace(/\.00$/, '')} %</span><span className="fname">{c.name} <span className="muted small">· {[c.pro, c.ipi && `IPI ${c.ipi}`, c.publisher || 'Sin editora'].filter(Boolean).join(' · ')}</span></span><span /></li>)}
          </ul>
        ) : <p className="muted">Sale del split del track. {r.work_id ? 'Agrega participantes en el split.' : 'Crea el split desde la carpeta del track.'}</p>}
        {r.work_id && <p className="small" style={{ marginTop: 8 }}><Link href={`/splits/${r.work_id}`}>Abrir split</Link></p>}
      </section>

      <Credits title="Producción e ingeniería" category="production" roles={PROD_ROLES} {...{ r, credits, people, canWrite, busy, run }} />
      <Credits title="Intérpretes" category="performer" roles={INSTRUMENTS.map((i) => [i, i] as const)} {...{ r, credits, people, canWrite, busy, run }} />
      <Credits title="Arte y video" category="visual" roles={VIS_ROLES} {...{ r, credits, people, canWrite, busy, run }} />


      {preview && (
        <Panel title="Label copy" onClose={() => setPreview(false)} wide>
          <LCPreview d={doc} />
          <footer><span /><div className="row"><button className="btn" onClick={() => out('xlsx')} disabled={busy}>Excel</button><button className="btn primary" onClick={() => out('pdf')} disabled={busy}>PDF</button></div></footer>
        </Panel>
      )}
      <Toast msg={toast} />
    </div>
  );
}

function Credits({ title, category, roles, r, credits, people, canWrite, busy, run }: {
  title: string; category: 'production' | 'performer' | 'visual'; roles: readonly (readonly [string, string])[];
  r: LCRecording; credits: Credit[]; people: P[]; canWrite: boolean; busy: boolean;
  run: (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => void;
}) {
  const list = credits.filter((c) => c.category === category);
  const sugg = SUGGESTED[category];
  const roleText = (role: string) => {
    const k = roles.find(([x]) => x === role);
    return !k ? role : category === 'performer' ? k[1] : `${k[1]} · ${k[0]}`;
  };
  const who = (c: Credit) => {
    const pe = c.person_id ? people.find((p) => p.id === c.person_id) : undefined;
    const legal = pe?.legal_name ?? c.people?.legal_name ?? c.display_name ?? '';
    const credit = pe?.credit_name ?? c.people?.credit_name ?? null;
    return { legal, credit };
  };
  return (
    <section className="card glass">
      <header><h2>{title}</h2>{list.length > 0 && <span className="pill">{list.length}</span>}</header>
      {list.length > 0 && (
        <div className="parts lc-parts">
          {list.map((c) => {
            const p = who(c);
            const extra = category === 'performer' ? (c.performer_type ? PERF_TYPES[c.performer_type] : '') : c.detail || '';
            return (
              <div key={c.id} className="lc-row">
                <div className="lc-who">
                  {p.legal ? <><b>{p.legal}</b>{p.credit && <span className="muted"> ({p.credit})</span>}</> : <span className="pill crit">Falta elegir persona</span>}
                </div>
                <div className="lc-role">{roleText(c.role)}</div>
                <div className="lc-extra muted small">{extra || '—'}</div>
                {canWrite ? <button type="button" className="icon-btn" aria-label="Quitar crédito" disabled={busy} onClick={() => run(() => removeCredit(c.id, r.id), 'Quitado')}>×</button> : <span />}
              </div>
            );
          })}
        </div>
      )}
      {list.length === 0 && !canWrite && <p className="muted">Sin créditos todavía.</p>}
      {canWrite && <AddCredit key={list.length} category={category} roles={roles} people={people} sugg={sugg} busy={busy}
        onAdd={(input, done) => run(() => addCreditFull(r.id, category, input), 'Agregado', done)} />}
    </section>
  );
}

// Barra para agregar: rol, persona (o perfil nuevo) y detalle; al agregar queda fijo arriba
function AddCredit({ category, roles, people, sugg, busy, onAdd }: {
  category: 'production' | 'performer' | 'visual'; roles: readonly (readonly [string, string])[]; people: P[]; sugg: string[]; busy: boolean;
  onAdd: (input: { role: string; person_id?: string | null; new_person?: { name: string; email: string } | null; detail?: string; performer_type?: string }, done: () => void) => void;
}) {
  const [role, setRole] = useState('');
  const [custom, setCustom] = useState('');
  const [person, setPerson] = useState('');
  const [newName, setNewName] = useState('');
  const [newMail, setNewMail] = useState('');
  const [detail, setDetail] = useState('');
  const [ptype, setPtype] = useState('session');
  const realRole = role === '__other' ? custom.trim() : role;
  const isNew = person === '__new';
  // primero quienes tienen ese rol en el directorio; el resto después
  const fit = people.filter((p) => p.kinds.some((k) => sugg.includes(k))).sort((a, b) => a.legal_name.localeCompare(b.legal_name));
  const rest = people.filter((p) => !fit.includes(p)).sort((a, b) => a.legal_name.localeCompare(b.legal_name));
  const ready = !!realRole && (isNew ? newName.trim().length >= 3 : !!person);
  const add = () => onAdd({
    role: realRole, person_id: isNew ? null : person, new_person: isNew ? { name: newName, email: newMail } : null,
    detail: category === 'performer' ? undefined : detail, performer_type: category === 'performer' ? ptype : undefined,
  }, () => { setRole(''); setCustom(''); setPerson(''); setNewName(''); setNewMail(''); setDetail(''); setPtype('session'); });
  return (
    <div className="lc-add">
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rol">
        <option value="">{category === 'performer' ? 'Instrumento o voz…' : 'Rol…'}</option>
        {roles.map(([k, v]) => <option key={k} value={k}>{category === 'performer' ? v : `${v} · ${k}`}</option>)}
        <option value="__other">Otro…</option>
      </select>
      <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Persona">
        <option value="">Elegir del directorio…</option>
        {fit.map((p) => <option key={p.id} value={p.id}>{p.credit_name ? `${p.credit_name} (${p.legal_name})` : p.legal_name}</option>)}
        {rest.length > 0 && <optgroup label="Otras personas">{rest.map((p) => <option key={p.id} value={p.id}>{p.credit_name ? `${p.credit_name} (${p.legal_name})` : p.legal_name}</option>)}</optgroup>}
        <option value="__new">＋ Nuevo perfil…</option>
      </select>
      {category === 'performer' ? (
        <select value={ptype} onChange={(e) => setPtype(e.target.value)} aria-label="Tipo">
          {Object.entries(PERF_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      ) : (
        <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={STUDIO_ROLES.includes(realRole) ? 'Estudio y ciudad' : 'Nota (opcional)'} aria-label="Detalle" />
      )}
      <button type="button" className="btn" disabled={!ready || busy} onClick={add}>Agregar</button>
      {role === '__other' && <input className="lc-wide" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Escribe el rol" aria-label="Rol personalizado" autoFocus />}
      {isNew && (
        <div className="quick-person lc-wide">
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre legal" aria-label="Nombre legal" />
          <input type="email" value={newMail} onChange={(e) => setNewMail(e.target.value)} placeholder="Correo (opcional)" aria-label="Correo" />
          <span className="muted small">Se agrega al directorio al dar Agregar; los demás datos los completas ahí.</span>
        </div>
      )}
    </div>
  );
}

function LCPreview({ d }: { d: LCDoc }) {
  const kv = (rows: [string, string][]) => <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="nil">—</span>}</dd></div>)}</dl>;
  return (
    <article className="paper lcdoc">
      <header className="lch">
        <div><div className="lce">Label copy · {d.workspace}</div><h3>{d.title}{d.version && <span className="v"> {d.version}</span>}</h3><p>{d.artist}</p></div>
        <div className={`lcst ${d.missing.length ? 'no' : 'ok'}`}>{d.missing.length ? `Falta ${d.missing.join(', ')}` : 'Completo'}</div>
      </header>
      <section><h4>Lanzamiento</h4>{kv(d.release)}</section>
      <section><h4>Track</h4>{kv(d.track)}</section>
      {SECTIONS.map((s) => {
        const rows = d[s.key] as string[][];
        return (
          <section key={s.key}><h4>{s.title}{s.key === 'composition' && <span> {d.splitState}</span>}</h4>
            {rows.length ? <div className="tw"><table className="lt2"><thead><tr>{s.heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v || <span className="nil">—</span>}</td>)}</tr>)}</tbody></table></div>
              : <p className="nil">Sin registros.</p>}
          </section>
        );
      })}
      <footer className="lcf">Preparó {d.preparedBy} · {d.generated}</footer>
    </article>
  );
}
