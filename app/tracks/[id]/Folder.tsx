'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  checklist, docLabel, docStatus, fmtDate, fmtSize, isWeTransfer, labelHandles, missingOf, requiredDocs,
  LINK_KINDS, TRACK_TYPES, type Asset, type DocKind, type Recording, type WorkspaceLegal,
} from '@/lib/tracks';
import { MAX_BYTES, makeThumb, sha256, uploadToFolder } from '@/lib/upload';
import Panel, { Toast } from '../../components/Panel';
import TrackForm from '../TrackForm';
import { Thumb } from '../TrackList';
import { addLink, recordFile, removeAsset, setDocStatus, setLegal } from '../actions';

type Props = { track: Recording; workspace: WorkspaceLegal; assets: Asset[]; urls: Record<string, string>; canWrite: boolean; canDelete: boolean };

export default function Folder({ track: r, workspace, assets, urls, canWrite, canDelete }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, start] = useTransition();
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);

  const run = (fn: () => Promise<{ error?: string }>, ok: string) => start(async () => {
    const res = await fn();
    setToast(res.error || ok);
    if (!res.error) router.refresh();
  });

  const items = checklist(r, assets, workspace);
  const miss = missingOf(items);
  const cover = assets.find((a) => a.kind === 'cover');
  const handles = labelHandles(r, workspace);
  const artistLine = [r.main_artist, r.featured_artists && `feat. ${r.featured_artists.split(';').map((s) => s.trim()).join(', ')}`].filter(Boolean).join(' ');

  return (
    <div className="stack">
      <Link href="/tracks" className="small back">← Tracks</Link>

      <section className="folder-head">
        <Thumb src={cover?.thumb_key ? urls[cover.thumb_key] : undefined} title={r.title} size={112} />
        <div className="fh-main">
          <p className="eyebrow">{workspace.name} · {TRACK_TYPES[r.track_type]}</p>
          <h1>{r.title}{r.version_title && <span className="muted"> ({r.version_title})</span>}</h1>
          <p className="muted">{artistLine || 'Sin artista'}</p>
          <div className="row" style={{ marginTop: 8 }}>
            {miss.length ? <span className="pill crit">Faltan {miss.length}</span> : <span className="pill ok">Listo para entregar</span>}
            {r.release_date && <span className="pill">{fmtDate(r.release_date)}</span>}
            {r.release_title && <span className="pill">{r.release_type ? `${r.release_type}: ` : ''}{r.release_title}</span>}
            {r.isrc && <span className="pill mono">{r.isrc}</span>}
          </div>
        </div>
        {canWrite && <button className="btn" onClick={() => setEditing(true)}>Editar ficha</button>}
      </section>

      <div className="folder-grid">
        <section className="card glass">
          <header><h2>Checklist</h2></header>
          <ul className="check">
            {items.map((i) => (
              <li key={i.key} className={i.soon ? 'soon' : ''}>
                <span className={`dot ${i.ok ? 'ok' : i.optional || i.soon ? '' : 'crit'}`} aria-hidden="true" />
                <span>{i.label}</span>
                <span className="muted small">{i.why}</span>
              </li>
            ))}
          </ul>
        </section>
        <CoverCard track={r} cover={cover} urls={urls} canWrite={canWrite} onDone={(m) => { setToast(m); router.refresh(); }} onError={setToast} />
      </div>

      <LinksCard track={r} assets={assets} canWrite={canWrite} busy={busy} run={run} />

      <section className="card glass">
        <header>
          <h2>Documentos</h2>
          {canWrite && (
            <label className="legal-sel small">
              <span className="muted">Lo legal lo lleva</span>
              <select value={r.label_handles_legal === null ? 'inherit' : r.label_handles_legal ? 'label' : 'us'} disabled={busy}
                onChange={(e) => run(() => setLegal(r.id, e.target.value as 'inherit' | 'label' | 'us'), 'Guardado')}>
                <option value="inherit">Como en {workspace.name} ({workspace.label_handles_legal ? 'la disquera' : 'nosotros'})</option>
                <option value="label">La disquera</option>
                <option value="us">Nosotros</option>
              </select>
            </label>
          )}
        </header>
        {handles ? (
          <p className="muted">La disquera se encarga de lo legal{r.label_handles_legal === null ? ` en ${workspace.name}` : ' en este track'}: no se pide WFH{r.track_type === 'feat' ? ' ni waiver' : ''}{r.track_type === 'cover' || r.track_type === 'remix' ? ' ni licencia' : ''}. Aun así puedes guardar documentos abajo.</p>
        ) : null}
        <div className="docs">
          {(handles ? [] : requiredDocs(r)).map((k) => (
            <DocRow key={k} track={r} kind={k} files={assets.filter((a) => a.kind === k)} urls={urls} canWrite={canWrite} busy={busy} run={run}
              onDone={(m) => { setToast(m); router.refresh(); }} onError={setToast} />
          ))}
          <DocRow track={r} kind="other_doc" files={assets.filter((a) => a.kind === 'other_doc')} urls={urls} canWrite={canWrite} busy={busy} run={run}
            onDone={(m) => { setToast(m); router.refresh(); }} onError={setToast} />
        </div>
      </section>

      {editing && (
        <Panel title="Editar ficha" onClose={() => setEditing(false)}>
          <TrackForm track={r} workspaces={[workspace]} canDelete={canDelete} onCancel={() => setEditing(false)}
            onSaved={() => { setEditing(false); setToast('Ficha guardada'); router.refresh(); }}
            onDeleted={() => router.push('/tracks')} />
        </Panel>
      )}
      <Toast msg={toast} />
    </div>
  );
}

// ---------- portada ----------

function CoverCard({ track, cover, urls, canWrite, onDone, onError }: {
  track: Recording; cover?: Asset; urls: Record<string, string>; canWrite: boolean; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState('');
  const [note, setNote] = useState('');
  const [armed, setArmed] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return onError('La portada tiene que ser JPG, PNG o WebP.');
    if (file.size > MAX_BYTES) return onError('La portada pesa más de 15 MB. Expórtala en JPG.');
    try {
      setState('Preparando…');
      const thumb = await makeThumb(file);
      setNote(thumb.width !== thumb.height || thumb.width < 3000 ? `Mide ${thumb.width}×${thumb.height}. Las distribuidoras piden 3000×3000.` : '');
      setState('Subiendo…');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const key = await uploadToFolder(track.workspace_id, track.id, file, ext, file.type);
      const thumbKey = await uploadToFolder(track.workspace_id, track.id, thumb.blob, 'jpg', 'image/jpeg');
      const res = await recordFile({ recording_id: track.id, kind: 'cover', storage_key: key, thumb_key: thumbKey, file_name: file.name, size_bytes: file.size, mime: file.type, sha256: await sha256(file) });
      if (res.error) onError(res.error); else onDone('Portada guardada');
    } catch {
      onError('No se pudo subir la portada. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setState('');
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    if (!cover) return;
    if (!armed) { setArmed(true); return; }
    setState('Quitando…');
    const res = await removeAsset(cover.id);
    setState(''); setArmed(false);
    if (res.error) onError(res.error); else onDone('Portada quitada');
  };

  return (
    <section className="card glass cover-card">
      <header><h2>Portada</h2>{cover && <span className="muted small">{fmtSize(cover.size_bytes)}</span>}</header>
      {cover && cover.thumb_key && urls[cover.thumb_key] ? (
        <img className="cover-img" src={urls[cover.thumb_key]} alt={`Portada de ${track.title}`} />
      ) : (
        <button type="button" className="cover-drop" disabled={!canWrite || !!state} onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (canWrite) pick(e.dataTransfer.files[0]); }}>
          {state || (canWrite ? 'Subir portada' : 'Sin portada')}
          {canWrite && !state && <span className="muted small">JPG o PNG, 3000×3000</span>}
        </button>
      )}
      {note && <p className="small" style={{ color: 'var(--warn)' }}>{note}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {cover && (
        <div className="row">
          {cover.storage_key && urls[cover.storage_key] && <a className="btn small" href={urls[cover.storage_key]} target="_blank" rel="noopener noreferrer">Original</a>}
          {canWrite && <button type="button" className="btn small" disabled={!!state} onClick={() => input.current?.click()}>{state || 'Reemplazar'}</button>}
          {canWrite && <button type="button" className={`btn small danger${armed ? ' armed' : ''}`} disabled={!!state} onClick={remove}>{armed ? 'Confirmar' : 'Quitar'}</button>}
        </div>
      )}
    </section>
  );
}

// ---------- enlaces ----------

function LinksCard({ track, assets, canWrite, busy, run }: {
  track: Recording; assets: Asset[]; canWrite: boolean; busy: boolean; run: (fn: () => Promise<{ error?: string }>, ok: string) => void;
}) {
  const links = assets.filter((a) => a.kind in LINK_KINDS).sort((a, b) => Object.keys(LINK_KINDS).indexOf(a.kind) - Object.keys(LINK_KINDS).indexOf(b.kind));
  const [kind, setKind] = useState(links.some((l) => l.kind === 'master') ? 'demo' : 'master');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [armed, setArmed] = useState('');
  const wt = isWeTransfer(url);
  const host = (u: string | null) => { try { return new URL(u!).hostname.replace(/^www\./, ''); } catch { return ''; } };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    run(async () => {
      const res = await addLink(track.id, kind, url, label);
      if (!res.error) { setUrl(''); setLabel(''); }
      return res;
    }, 'Enlace guardado');
  };

  return (
    <section className="card glass">
      <header><h2>Audio y video</h2><span className="muted small">Solo enlaces: el archivo vive en tu Drive, Dropbox o Disco</span></header>
      {links.length > 0 && (
        <ul className="files">
          {links.map((l) => (
            <li key={l.id}>
              <span className="pill">{LINK_KINDS[l.kind as keyof typeof LINK_KINDS]}</span>
              <span className="fname">{l.label || host(l.external_url)}{l.label && <span className="muted small"> · {host(l.external_url)}</span>}
                {isWeTransfer(l.external_url || '') && <span className="small" style={{ color: 'var(--warn)', display: 'block' }}>WeTransfer caduca: cámbialo por un enlace permanente</span>}</span>
              <span className="row">
                <a className="btn small" href={l.external_url!} target="_blank" rel="noopener noreferrer">Abrir</a>
                {canWrite && <button className={`btn small danger${armed === l.id ? ' armed' : ''}`} disabled={busy}
                  onClick={() => armed === l.id ? (setArmed(''), run(() => removeAsset(l.id), 'Enlace quitado')) : setArmed(l.id)}>{armed === l.id ? 'Confirmar' : 'Quitar'}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="link-form" onSubmit={add}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Qué es">
            {Object.entries(LINK_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="url" placeholder="https://drive.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Enlace" />
          <input type="text" placeholder="Nombre (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Nombre del enlace" />
          <button className="btn primary" disabled={busy || !url.trim()}>Agregar</button>
        </form>
      )}
      {canWrite && (
        <p className="small" style={{ marginTop: 10, color: wt ? 'var(--warn)' : 'var(--muted)' }}>
          {wt ? 'Los enlaces de WeTransfer caducan en unos días y la carpeta quedaría rota. Mejor súbelo a Drive o Dropbox y pega ese enlace.'
            : 'Deja el enlace abierto para quien lo tenga; si no, la disquera o Margarita no lo podrán abrir.'}
        </p>
      )}
    </section>
  );
}

// ---------- documentos ----------

function DocRow({ track, kind, files, urls, canWrite, busy, run, onDone, onError }: {
  track: Recording; kind: DocKind; files: Asset[]; urls: Record<string, string>; canWrite: boolean; busy: boolean;
  run: (fn: () => Promise<{ error?: string }>, ok: string) => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState('');
  const [armed, setArmed] = useState('');
  const status = kind === 'other_doc' ? null : docStatus(track, kind);

  const pick = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') return onError('Sube el documento en PDF.');
    if (file.size > MAX_BYTES) return onError('El PDF pesa más de 15 MB.');
    try {
      setState('Subiendo…');
      const key = await uploadToFolder(track.workspace_id, track.id, file, 'pdf', 'application/pdf');
      const res = await recordFile({ recording_id: track.id, kind, storage_key: key, file_name: file.name, size_bytes: file.size, mime: file.type, sha256: await sha256(file) });
      if (res.error) onError(res.error); else onDone(`${docLabel(track, kind)} guardado`);
    } catch {
      onError('No se pudo subir el documento. Intenta de nuevo.');
    } finally {
      setState('');
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="doc">
      <div className="doc-head">
        <div>
          <b>{docLabel(track, kind)}</b>
          {status && <span className={`pill ${status === 'signed' ? 'ok' : status === 'na' ? '' : 'crit'}`} style={{ marginLeft: 8 }}>{status === 'signed' ? 'Firmado' : status === 'na' ? 'No aplica' : 'Pendiente'}</span>}
        </div>
        {canWrite && (
          <div className="row">
            {status && status !== 'signed' && kind !== 'other_doc' && (
              <button className="btn small ghost" disabled={busy} onClick={() => run(() => setDocStatus(track.id, kind, status === 'na' ? 'pending' : 'na'), 'Guardado')}>
                {status === 'na' ? 'Sí aplica' : 'No aplica'}
              </button>
            )}
            <button className="btn small" disabled={!!state || busy} onClick={() => input.current?.click()}>{state || 'Subir PDF'}</button>
          </div>
        )}
      </div>
      {files.length > 0 && (
        <ul className="files">
          {files.map((f) => (
            <li key={f.id}>
              <span className="muted small">{fmtDate(f.created_at.slice(0, 10))}</span>
              <span className="fname">{f.file_name} <span className="muted small">· {fmtSize(f.size_bytes)}</span>
                {f.sha256 && <span className="hash" title={`Huella SHA-256: ${f.sha256}`}>Huella {f.sha256.slice(0, 12)}…</span>}</span>
              <span className="row">
                {f.storage_key && urls[f.storage_key] && <a className="btn small" href={urls[f.storage_key]} target="_blank" rel="noopener noreferrer">Ver</a>}
                {canWrite && <button className={`btn small danger${armed === f.id ? ' armed' : ''}`} disabled={busy}
                  onClick={() => armed === f.id ? (setArmed(''), run(() => removeAsset(f.id), 'Documento quitado')) : setArmed(f.id)}>{armed === f.id ? 'Confirmar' : 'Quitar'}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

