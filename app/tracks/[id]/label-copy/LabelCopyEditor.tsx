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
import { addCredit, quickPerson, removeCredit, saveLabelCopy, updateCredit, type LCInput } from './actions';

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
  // solo quien tiene ese rol en el directorio (más quien ya esté elegido)
  const forRole = (sel: string | null) => people.filter((p) => p.kinds.some((k) => sugg.includes(k)) || p.id === sel).sort((a, b) => a.legal_name.localeCompare(b.legal_name));
  const [newFor, setNewFor] = useState<{ id: string; role: string } | null>(null);
  return (
    <section className="card glass">
      <header><h2>{title}</h2>{canWrite && <button className="btn small" disabled={busy} onClick={() => run(() => addCredit(r.id, category), 'Agregado')}>Agregar</button>}</header>
      {list.length === 0 ? <p className="muted">Sin créditos todavía.</p> : (
        <div className="credits">
          {list.map((c) => {
            const known = roles.some(([k]) => k === c.role);
            return (
              <fieldset key={c.id + c.role + c.person_id + c.display_name + c.detail + c.performer_type} className="plain credit" disabled={!canWrite || busy}>
                <select value={known ? c.role : '__other'} aria-label="Rol"
                  onChange={(e) => e.target.value !== '__other' && run(() => updateCredit(c.id, r.id, { role: e.target.value }), 'Guardado')}>
                  {roles.map(([k, v]) => <option key={k} value={k}>{category === 'performer' ? v : `${v} · ${k}`}</option>)}
                  <option value="__other">Otro…</option>
                </select>
                <select value={newFor?.id === c.id ? '__new' : c.person_id ?? (c.display_name ? '__free' : '')} aria-label="Persona"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__new') { setNewFor({ id: c.id, role: c.role }); return; }
                    setNewFor(null);
                    if (v && v !== '__free') run(() => updateCredit(c.id, r.id, { person_id: v }), 'Guardado');
                  }}>
                  <option value="">Elegir del directorio…</option>
                  {forRole(c.person_id).map((p) => <option key={p.id} value={p.id}>{p.credit_name ? `${p.credit_name} (${p.legal_name})` : p.legal_name}</option>)}
                  {c.display_name && <option value="__free">{c.display_name} (sin perfil)</option>}
                  <option value="__new">＋ Nuevo perfil…</option>
                </select>
                {category === 'performer' ? (
                  <select value={c.performer_type ?? 'session'} aria-label="Tipo" onChange={(e) => run(() => updateCredit(c.id, r.id, { performer_type: e.target.value }), 'Guardado')}>
                    {Object.entries(PERF_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                ) : (
                  <input defaultValue={c.detail ?? ''} placeholder={STUDIO_ROLES.includes(c.role) ? 'Estudio y ciudad' : 'Nota (opcional)'} aria-label="Detalle"
                    onBlur={(e) => e.target.value.trim() !== (c.detail ?? '') && run(() => updateCredit(c.id, r.id, { detail: e.target.value }), 'Guardado')} />
                )}
                {!known && <input defaultValue={c.role} placeholder="Escribe el rol" aria-label="Rol personalizado" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.role && run(() => updateCredit(c.id, r.id, { role: e.target.value }), 'Guardado')} />}
                <button type="button" className="icon-btn" aria-label="Quitar crédito" onClick={() => run(() => removeCredit(c.id, r.id), 'Quitado')}>×</button>
                {newFor?.id === c.id && (
                  <QuickPerson busy={busy} onCancel={() => setNewFor(null)}
                    onSave={(name, email) => run(() => quickPerson(r.id, c.id, category, c.role, name, email), 'Perfil creado', () => setNewFor(null))} />
                )}
              </fieldset>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuickPerson({ busy, onSave, onCancel }: { busy: boolean; onSave: (name: string, email: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div className="quick-person">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre legal" aria-label="Nombre legal" />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo (opcional)" aria-label="Correo" />
      <button type="button" className="btn small primary" disabled={busy || name.trim().length < 3} onClick={() => onSave(name, email)}>Guardar</button>
      <button type="button" className="btn small" onClick={onCancel}>Cancelar</button>
      <span className="muted small">Se agrega al directorio; los demás datos los completas ahí.</span>
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
