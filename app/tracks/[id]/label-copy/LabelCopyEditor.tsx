'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CODE_FORMATS, EXPLICIT, INSTRUMENTS, LANGS, PERF_TYPES, PROD_ROLES, SECTIONS, STUDIO_ROLES, SUGGESTED, VIS_ROLES,
  buildDoc, fmtDuration, lcPdf, lcXlsx, type Code, type CompRow, type Credit, type LCDoc, type LCRecording,
} from '@/lib/labelcopy';
import { downloadBlob, fileSafe } from '@/lib/letter';
import Panel, { Toast } from '../../../components/Panel';
import { addCredit, removeCredit, saveCode, saveLabelCopy, updateCredit, type LCInput } from './actions';

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
              {field('label_name', 'Sello')}
              {field('distributor', 'Distribuidora')}
              {field('upc', 'UPC', '12 o 13 dígitos')}
              {field('genre', 'Género')}
              <label className="f"><span>Contenido</span>
                <select value={f.explicit} onChange={(e) => set('explicit', e.target.value)}>{Object.entries(EXPLICIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="f"><span>Idioma</span>
                <select value={f.language} onChange={(e) => set('language', e.target.value)}>{LANGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              {field('duration', 'Duración', 'min:seg', '', '3:24')}
              {field('iswc', 'ISWC', r.work_id ? 'de la obra' : 'crea el split primero', '', 'T-123.456.789-0')}
              {field('delivery_contact', 'Contacto de entrega', 'correo o teléfono')}
            </div>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="pline">{field('p_year', '℗ Año')}{field('p_owner', 'Titular del máster', '', '', 'ej. Kevin Cuadras')}</div>
              <div className="pline">{field('c_year', '© Año')}{field('c_owner', 'Titular del arte', '', '', 'ej. Kevin Cuadras')}</div>
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

      <section className="card glass">
        <header><h2>Códigos por formato</h2><span className="muted small">El audio estéreo usa el ISRC y UPC de arriba. Hi-Res comparte el mismo ISRC.</span></header>
        <div className="codes">
          {Object.entries(CODE_FORMATS).map(([k, label]) => {
            const c = codes.find((x) => x.format === k);
            return <CodeRow key={k + (c?.isrc ?? '') + (c?.upc ?? '')} label={label} code={c} disabled={!canWrite || busy}
              onSave={(isrc, upc) => run(() => saveCode(r.id, k, isrc, upc), 'Guardado')} />;
          })}
        </div>
      </section>

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
  run: (fn: () => Promise<{ error?: string }>, ok: string) => void;
}) {
  const list = credits.filter((c) => c.category === category);
  const sugg = SUGGESTED[category];
  const sorted = [...people].sort((a, b) => Number(b.kinds.some((k) => sugg.includes(k))) - Number(a.kinds.some((k) => sugg.includes(k))) || a.legal_name.localeCompare(b.legal_name));
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
                  <option value="__other">{known ? 'Otro…' : c.role}</option>
                </select>
                <select value={c.person_id ?? (c.display_name ? '__free' : '')} aria-label="Persona"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__free') { const n = prompt('Nombre como aparece en créditos'); if (n?.trim()) run(() => updateCredit(c.id, r.id, { display_name: n }), 'Guardado'); return; }
                    if (v) run(() => updateCredit(c.id, r.id, { person_id: v }), 'Guardado');
                  }}>
                  <option value="">Elegir del directorio…</option>
                  {sorted.map((p) => <option key={p.id} value={p.id}>{p.credit_name ? `${p.credit_name} (${p.legal_name})` : p.legal_name}</option>)}
                  <option value="__free">{c.display_name ? `${c.display_name} (sin perfil)` : 'Escribir nombre sin perfil…'}</option>
                </select>
                {category === 'performer' ? (
                  <select value={c.performer_type ?? 'session'} aria-label="Tipo" onChange={(e) => run(() => updateCredit(c.id, r.id, { performer_type: e.target.value }), 'Guardado')}>
                    {Object.entries(PERF_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                ) : (
                  <input defaultValue={c.detail ?? ''} placeholder={STUDIO_ROLES.includes(c.role) ? 'Estudio y ciudad' : 'Nota (opcional)'} aria-label="Detalle"
                    onBlur={(e) => e.target.value.trim() !== (c.detail ?? '') && run(() => updateCredit(c.id, r.id, { detail: e.target.value }), 'Guardado')} />
                )}
                {!known && <input defaultValue={c.role} aria-label="Rol personalizado" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.role && run(() => updateCredit(c.id, r.id, { role: e.target.value }), 'Guardado')} />}
                <button type="button" className="icon-btn" aria-label="Quitar crédito" onClick={() => run(() => removeCredit(c.id, r.id), 'Quitado')}>×</button>
              </fieldset>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CodeRow({ label, code, disabled, onSave }: { label: string; code?: Code; disabled: boolean; onSave: (isrc: string, upc: string) => void }) {
  const [isrc, setIsrc] = useState(code?.isrc ?? '');
  const [upc, setUpc] = useState(code?.upc ?? '');
  const changed = isrc !== (code?.isrc ?? '') || upc !== (code?.upc ?? '');
  return (
    <div className="code-row">
      <span>{label}</span>
      <input value={isrc} onChange={(e) => setIsrc(e.target.value)} placeholder="ISRC" aria-label={`ISRC de ${label}`} disabled={disabled} />
      <input value={upc} onChange={(e) => setUpc(e.target.value)} placeholder="UPC" aria-label={`UPC de ${label}`} disabled={disabled} />
      <button className="btn small" disabled={disabled || !changed} onClick={() => onSave(isrc, upc)}>Guardar</button>
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
