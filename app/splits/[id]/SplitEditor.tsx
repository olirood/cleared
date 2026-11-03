'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROLES, fmtPct, fmtDateTime, parsePct, type Agreement, type Approval, type Participant, type Signature, type Work } from '@/lib/splits';
import { missing, type Person } from '@/lib/people';
import { fmtDate } from '@/lib/tracks';
import { certificatePdf, downloadBlob, fileSafe, letterPdf, rowFrom, type LetterModel } from '@/lib/letter';
import type { Member } from '@/lib/session';
import { needsApproval, repLabel, type Rep } from '@/lib/reps';
import Panel, { Toast } from '../../components/Panel';
import Letter from '../../components/Letter';
import { ProfilePanel } from '../../directorio/Directory';
import WorkForm from '../WorkForm';
import { addParticipant, setLetterLanguage, startSplit, decide, ensureArchived, equalize, issueLink, newVersion, removeParticipant, resendFinal, sendSplit, updateParticipant } from '../actions';

type Log = { id: number; action: string; detail: Record<string, unknown> | null; at: string; entity_id: string; workspace_id: string | null };
type Props = {
  work: Work; workspaces: { id: string; name: string; letter_template: string }[]; memberships: Member[];
  agreements: Agreement[]; current: Agreement | null; participants: Participant[]; approvals: Approval[]; signatures: Signature[];
  changes: { id: string; participant_id: string | null; note: string; created_at: string }[]; currentSig: string;
  log: Log[]; tracks: { id: string; title: string }[]; people: Person[]; reps: Rep[];
};

const ACTIONS: Record<string, string> = {
  created: 'Split creado', sent: 'Cerrado y enviado a firma', approved: 'Aprobado por', changes_requested: 'Cambio pedido por',
  link_issued: 'Enlace de firma generado', signed: 'Firmó', completed: 'Firmado por todas las partes',
  change_requested: 'Un firmante pidió un cambio', new_version: 'Versión nueva creada', final_sent: 'Copia final reenviada por correo',
};

export default function SplitEditor(props: Props) {
  const { work, workspaces, memberships, agreements, current, participants, approvals, signatures, changes, currentSig, log, tracks, people, reps: repList } = props;
  const router = useRouter();
  const [toast, setToast] = useState('');
  const [busy, start] = useTransition();
  const [panel, setPanel] = useState<null | 'edit' | 'letter' | { profile: Person | 'new' }>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ ws: string; text: string } | null>(null);
  const [armed, setArmed] = useState('');
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2800); return () => clearTimeout(id); }, [toast]);
  // guarda el PDF firmado la primera vez que se abre (y lo agrega a sus tracks)
  useEffect(() => { if (current?.status === 'signed') ensureArchived(work.id).then(() => { if (!current.final_pdf_key) router.refresh(); }); }, [current?.status, current?.final_pdf_key, work.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleIn = (ws: string | null) => memberships.find((m) => m.workspace_id === ws)?.role;
  const writer = (ws: string | null) => ['owner', 'admin', 'operator'].includes(roleIn(ws) ?? '');
  const owner = workspaces.find((w) => w.id === work.workspace_id);
  const isOwner = writer(work.workspace_id);
  const external = !roleIn(work.workspace_id);
  const wsName = (id: string | null) => workspaces.find((w) => w.id === id)?.name ?? '';
  const person = (id: string) => people.find((p) => p.id === id);
  const draft = current?.status === 'draft';
  const used = new Set(participants.map((p) => p.person_id));
  const sum = participants.reduce((a, p) => a + p.share_bp, 0);

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => start(async () => {
    const r = await fn();
    setToast(r.error || ok);
    if (!r.error) { after?.(); router.refresh(); }
  });

  // espacios que representan a alguien del split (sin contar al dueño)
  const reps = [...new Set(participants.map((p) => person(p.person_id)?.represented_by).filter((w): w is string => !!w && needsApproval(repList, w, work.workspace_id)))];
  const repName = (ws: string | null) => repLabel(repList, ws, wsName(ws));
  const apState = (ws: string) => {
    const a = approvals.find((x) => x.workspace_id === ws);
    if (!a) return { state: 'pending' as const, a };
    if (a.participants_sig !== currentSig) return { state: a.status === 'approved' ? 'stale' as const : 'pending' as const, a };
    return { state: a.status === 'approved' ? 'ok' as const : 'changes' as const, a };
  };

  const problems: string[] = [];
  if (draft) {
    if (!participants.length) problems.push('Agrega a las personas que escribieron la canción.');
    else if (sum !== 10000) problems.push(sum > 10000 ? `Sobran ${fmtPct(sum - 10000)} %.` : `Faltan ${fmtPct(10000 - sum)} %.`);
    participants.forEach((p) => { const pe = person(p.person_id); const m = pe ? missing(pe) : ['perfil']; if (pe && !pe.email) m.push('correo'); if (m.length) problems.push(`A ${pe?.legal_name ?? 'un participante'} le falta ${m.join(', ')}.`); });
    reps.forEach((ws) => { if (apState(ws).state !== 'ok') problems.push(writer(ws) ? 'Falta que apruebes tu parte.' : `Falta que ${repName(ws)} apruebe.`); });
  }

  const sigOf = (pid: string) => signatures.find((s) => s.participant_id === pid);
  const lang = current?.language === 'es' ? 'es' : 'en';
  const model: LetterModel | null = current && {
    title: work.title, artist: work.artist || '', version: current.version, status: current.status, lang,
    date: work.session_date || (current.sent_at || new Date().toISOString()).slice(0, 10),
    template: current.template || owner?.letter_template || 'generic', workspace: owner?.name || '',
    rows: participants.map((p) => {
      const pe = person(p.person_id);
      const snap = p.snapshot ?? { legal_name: pe?.legal_name, credit_name: pe?.credit_name, publisher: pe?.publishers?.name, pro: pe?.pro, ipi: pe?.ipi, email: pe?.email, phone: pe?.phone };
      return rowFrom({ role: p.role, share_bp: p.share_bp, credits: p.credits, snap, sig: sigOf(p.id) }, lang);
    }),
    hash: current.content_sha256, sentAt: current.sent_at, completedAt: current.completed_at,
    log: log.filter((l) => l.entity_id === current.id).map((l) => ({ at: l.at, text: logText(l) })),
  };
  function logText(l: Log) {
    const base = ACTIONS[l.action] ?? l.action;
    if (l.action === 'approved' || l.action === 'changes_requested') return `${base} ${wsName(l.workspace_id)}${l.detail?.note ? `: “${l.detail.note}”` : ''}`;
    if (l.action === 'signed') return `${base} ${String(l.detail?.typed_name ?? '')}`;
    if (l.action === 'new_version') return `${base} (antes v${l.detail?.from})`;
    return base;
  }
  const pdf = () => model && start(async () => {
    try { downloadBlob(await letterPdf(model), `Split ${fileSafe(work.title)} v${model.version}.pdf`); }
    catch { setToast('No se pudo generar el PDF.'); }
  });
  const certPdf = () => model && start(async () => {
    try { downloadBlob(await certificatePdf(model), `Constancia de firma ${fileSafe(work.title)} v${model.version}.pdf`); }
    catch { setToast('No se pudo generar la constancia.'); }
  });

  const shareMsg = (pid: string, link: string) => {
    const p = participants.find((x) => x.id === pid);
    const n = (p?.snapshot?.legal_name || person(p?.person_id ?? '')?.legal_name || '').split(' ')[0];
    return `Hola ${n}, te comparto el split de “${work.title}” para que lo revises y firmes: ${link}`;
  };
  const waUrl = (pid: string, link: string) => {
    const p = participants.find((x) => x.id === pid);
    const phone = (p?.snapshot?.phone || person(p?.person_id ?? '')?.phone || '').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(shareMsg(pid, link))}`;
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setToast('Copiado'); } catch { setToast('No se pudo copiar'); } };

  return (
    <div className="stack">
      <Link href="/splits" className="small back">← Splits</Link>

      <section className="folder-head">
        <span className="thumb blank" style={{ width: 72, height: 72, fontSize: '1.6rem' }} aria-hidden="true">{work.title.trim()[0]?.toUpperCase()}</span>
        <div className="fh-main">
          <p className="eyebrow">{owner?.name} · {!roleIn(work.workspace_id) ? 'Split' : tracks.length ? 'Split de track' : 'Split de sesión'}</p>
          <h1>{work.title}</h1>
          <p className="muted">{work.artist || 'Sin artista'}</p>
          <div className="row" style={{ marginTop: 8 }}>
            {current && <StatusPill a={current} participants={participants} signatures={signatures} />}
            {work.session_date && <span className="pill">{fmtDate(work.session_date)}</span>}
            {work.session_with && <span className="pill">Sesión con {work.session_with}</span>}
            {work.studio && <span className="pill">{work.studio}</span>}
            {tracks.map((t) => <Link key={t.id} href={`/tracks/${t.id}`} className="pill info" style={{ textDecoration: 'none' }}>Track: {t.title}</Link>)}
          </div>
        </div>
        <div className="row">
          {isOwner && <button className="btn" onClick={() => setPanel('edit')}>Editar datos</button>}
          {current && participants.length > 0 && <button className="btn" onClick={() => setPanel('letter')}>Ver carta</button>}
          {current && participants.length > 0 && <button className="btn" onClick={pdf} disabled={busy}>PDF</button>}
          {current && current.status !== 'draft' && <button className="btn" onClick={certPdf} disabled={busy} title="Constancia de firma: cómo firmó cada quien, bitácora y aviso aceptado">Constancia</button>}
        </div>
      </section>

      {external && (
        <div className="banner info"><span>Este split es de <b>{owner?.name}</b>. Ves la obra porque representas a alguien en él. Revisa su parte y apruébala; los porcentajes los cambia {owner?.name}.</span></div>
      )}

      {current && current.status === 'sent' && changes.length > 0 && (
        <div className="banner crit">
          <span>{changes.map((c) => {
            const p = participants.find((x) => x.id === c.participant_id);
            return <span key={c.id} style={{ display: 'block' }}><b>{p?.snapshot?.legal_name ?? 'Un firmante'}</b> pidió un cambio: “{c.note}”</span>;
          })}</span>
          {isOwner && <button className="btn" disabled={busy} onClick={() => run(() => newVersion(current.id), `Versión ${current.version + 1} creada`)}>Crear versión {current.version + 1}</button>}
        </div>
      )}

      {!current && (
        <section className="card glass empty">
          <h2>Esta obra aún no tiene split</h2>
          <p>Empieza la versión 1 para agregar a quienes escribieron la canción y sus porcentajes.</p>
          {writer(work.workspace_id) && <button className="btn primary" disabled={busy} onClick={() => run(() => startSplit(work.id), 'Split creado')}>Empezar split</button>}
        </section>
      )}

      {current && (
        <section className="card glass">
          <header>
            <div className="row"><h2>Participantes</h2><span className="pill">v{current.version} · {draft ? 'borrador' : current.status === 'signed' ? 'firmado' : current.status === 'void' ? 'anulado' : 'en firma'}</span></div>
            {draft && isOwner && participants.length > 1 && <button className="btn" disabled={busy} onClick={() => run(() => equalize(current.id), 'Repartido en partes iguales')}>Repartir parejo</button>}
          </header>

          {participants.length ? (
            <div className="parts">
              <div className="prow head"><span>Participante</span><span>Rol</span><span>% autoral</span><span /></div>
              {participants.map((p) => {
                const pe = person(p.person_id);
                const snap = p.snapshot;
                const nameShown = snap?.legal_name ?? pe?.legal_name ?? 'Perfil no visible';
                const facts = [snap?.pro ?? pe?.pro, (snap?.ipi ?? pe?.ipi) && `IPI ${snap?.ipi ?? pe?.ipi}`, snap?.publisher ?? pe?.publishers?.name ?? 'Sin editora'].filter(Boolean).join(' · ');
                const miss = draft && pe ? [...missing(pe), ...(pe.email ? [] : ['correo'])] : [];
                const rep = pe?.represented_by && needsApproval(repList, pe.represented_by, work.workspace_id) ? pe.represented_by : null;
                const canEditRow = draft && isOwner;
                const canFix = pe && (writer(pe.owner_workspace_id) || writer(pe.represented_by));
                return (
                  <div key={p.id} className={`prow${rep && roleIn(rep) ? ' mine' : ''}`}>
                    <div className="pwho">
                      <strong>{nameShown}</strong>{(snap?.credit_name ?? pe?.credit_name) && <span className="muted small"> ({snap?.credit_name ?? pe?.credit_name})</span>}
                      <div className="meta mono">{facts}</div>
                      {rep && <span className="pill info" style={{ marginTop: 6 }}>Lo representa {repName(rep)}</span>}
                      {canEditRow ? (
                        <input className="credit-in" defaultValue={p.credits ?? ''} key={`c-${p.id}-${p.credits}`} placeholder="Créditos en la carta, ej. Writer, Producer" aria-label={`Créditos de ${nameShown}`}
                          onBlur={(e) => { if (e.target.value.trim() !== (p.credits ?? '')) run(() => updateParticipant(p.id, { credits: e.target.value }), 'Guardado'); }} />
                      ) : p.credits && <div className="small" style={{ marginTop: 4 }}>{p.credits}</div>}
                      {miss.length > 0 && (
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <span className="pill crit">Falta {miss.join(', ')}</span>
                          {canFix && <button className="btn ghost small" onClick={() => setPanel({ profile: pe })}>Completar</button>}
                        </div>
                      )}
                    </div>
                    {canEditRow ? (
                      <select value={p.role} aria-label="Rol" disabled={busy} onChange={(e) => run(() => updateParticipant(p.id, { role: e.target.value }), 'Guardado')}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : <span className="small">{ROLES[p.role]}</span>}
                    {canEditRow ? (
                      <div className="pct">
                        <input inputMode="decimal" defaultValue={fmtPct(p.share_bp)} key={`s-${p.id}-${p.share_bp}`} aria-label={`Porcentaje de ${nameShown}`}
                          onBlur={(e) => {
                            const bp = parsePct(e.target.value);
                            if (bp === null) { setToast('Escribe un porcentaje entre 0.01 y 100'); e.target.value = fmtPct(p.share_bp); return; }
                            if (bp !== p.share_bp) run(() => updateParticipant(p.id, { share_bp: bp }), 'Guardado');
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                        <span>%</span>
                      </div>
                    ) : <span className="mono">{fmtPct(p.share_bp)} %</span>}
                    {canEditRow ? <button className="icon-btn" aria-label={`Quitar a ${nameShown}`} disabled={busy} onClick={() => run(() => removeParticipant(p.id), 'Quitado')}>×</button> : <span />}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">Agrega a las personas que escribieron la canción. Sus datos editoriales se llenan solos desde el directorio.</p>}

          {draft && isOwner && <AddParticipant people={people.filter((p) => !used.has(p.id))} busy={busy}
            onAdd={(pid) => run(() => addParticipant(current.id, pid), 'Agregado')} onNew={() => setPanel({ profile: 'new' })} />}

          {reps.length > 0 && (draft || approvals.length > 0) && (
            <div className="appr">
              <div className="appr-h"><b>Aprobación de representantes</b><span className="muted small">{draft ? 'Se manda a firma cuando aprueben todos. Si cambia alguien, su rol o su %, hay que aprobar otra vez.' : 'Aprobado antes de enviar.'}</span></div>
              {reps.filter((ws) => draft || approvals.some((x) => x.workspace_id === ws)).map((ws) => {
                const { state: live, a } = apState(ws);
                const state = draft ? live : a?.status === 'approved' ? 'ok' : live;
                const who = participants.filter((p) => person(p.person_id)?.represented_by === ws).map((p) => person(p.person_id)?.legal_name).join(', ');
                const mineWs = writer(ws);
                return (
                  <div key={ws} className="appr-row">
                    <div>
                      <b>{repName(ws)}</b> <span className="muted small">representa a {who}</span>
                      {state === 'changes' && a?.note && <div className="small" style={{ color: 'var(--crit)', marginTop: 2 }}>“{a.note}”</div>}
                      {state === 'pending' && a?.status === 'changes_requested' && a.note && <div className="small muted" style={{ marginTop: 2 }}>Pidió: “{a.note}”. El split ya cambió; falta que apruebe.</div>}
                    </div>
                    <div className="row">
                      {state === 'ok' ? <span className="pill ok">Aprobado · {fmtDate(a!.decided_at.slice(0, 10))}</span>
                        : state === 'changes' ? <span className="pill crit">Pidió cambio</span>
                        : state === 'stale' ? <span className="pill warn">Cambió el split: falta aprobar otra vez</span>
                        : <span className="pill warn">Esperando aprobación</span>}
                      {draft && mineWs && state !== 'ok' && <button className="btn small primary" disabled={busy} onClick={() => run(() => decide(current.id, ws, 'approved', ''), 'Aprobado')}>Aprobar</button>}
                      {draft && mineWs && <button className="btn small" disabled={busy} onClick={() => setNote({ ws, text: '' })}>Pedir cambio</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {draft && (
            <>
              <div className="total">
                <div className={`bar ${sum === 10000 ? 'ok' : sum > 10000 ? 'over' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sum / 100}><i style={{ width: `${Math.min(100, sum / 100)}%` }} /></div>
                <span className="amt mono" style={{ color: sum === 10000 ? 'var(--ok)' : sum > 10000 ? 'var(--crit)' : 'var(--warn)' }}>
                  {sum === 10000 ? 'Total 100 %' : sum > 10000 ? `Sobran ${fmtPct(sum - 10000)} %` : `Faltan ${fmtPct(10000 - sum)} %`}
                </span>
              </div>
              <ul className="problems">{problems.map((x) => <li key={x}>{x}</li>)}</ul>
              {isOwner && (
                <div className="row spread" style={{ marginTop: 16 }}>
                  <span className="muted small lang-line"><span>Carta de {owner?.name} en</span>
                    <span className="seg seg-mini" role="group" aria-label="Idioma de la carta">
                      {(['en', 'es'] as const).map((l) => <button key={l} type="button" className="seg-b" aria-pressed={lang === l} disabled={!isOwner || busy} onClick={() => lang !== l && run(() => setLetterLanguage(current.id, l), l === 'es' ? 'Carta en español' : 'Carta en inglés')}>{l === 'es' ? 'Español' : 'English'}</button>)}
                    </span>
                    <span className="lang-note">Todos firman la misma carta. Al enviar se congela: cualquier cambio después crea una versión nueva.</span></span>
                  <button className="btn primary" disabled={busy || problems.length > 0}
                    onClick={() => run(async () => { const r = await sendSplit(current.id); if (r.links) setLinks(r.links); return r; }, 'Enviado a firma. Comparte los enlaces.')}>Cerrar y enviar a firma</button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {current && current.status !== 'draft' && (
        <section className="card glass">
          <header><h2>Firmas</h2>{current.status === 'sent' && isOwner && changes.length === 0 && (
            <button className={`btn small${armed === 'nv' ? ' danger armed' : ''}`} disabled={busy}
              onClick={() => armed === 'nv' ? (setArmed(''), run(() => newVersion(current.id), `Versión ${current.version + 1} creada`)) : setArmed('nv')}>
              {armed === 'nv' ? 'Confirmar: anular y corregir' : `Corregir y crear versión ${current.version + 1}`}</button>)}</header>
          <ul className="signers">
            {participants.map((p) => {
              const s = sigOf(p.id);
              const asked = changes.some((c) => c.participant_id === p.id);
              const pe = person(p.person_id);
              const canLink = current.status === 'sent' && s?.status !== 'signed' && (isOwner || writer(pe?.represented_by ?? null));
              const link = links[p.id];
              return (
                <li key={p.id}>
                  <div>
                    <strong>{p.snapshot?.legal_name}</strong> <span className="muted small">{p.snapshot?.phone || p.snapshot?.email || ''}</span>
                    <div style={{ marginTop: 4 }}>
                      {s?.status === 'signed' ? <span className="pill ok">Firmó · {fmtDateTime(s.signed_at)}</span>
                        : asked ? <span className="pill crit">Pidió cambio</span>
                        : current.status === 'void' ? <span className="pill">Anulado</span>
                        : s ? <span className="pill warn">Pendiente · enlace vence {fmtDate(s.expires_at.slice(0, 10))}</span>
                        : <span className="pill crit">Sin enlace</span>}
                    </div>
                    {link && (
                      <div className="linkbox">
                        <code>{link}</code>
                        <div className="row">
                          <button className="btn small" onClick={() => copy(shareMsg(p.id, link))}>Copiar mensaje</button>
                          <a className="btn small primary" href={waUrl(p.id, link)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                        </div>
                        <span className="muted small">Por seguridad el enlace solo se muestra ahora. Si se pierde, genera uno nuevo.</span>
                      </div>
                    )}
                  </div>
                  <div className="acts">
                    {canLink && <button className="btn small" disabled={busy}
                      onClick={() => run(async () => { const r = await issueLink(p.id); if (r.link) setLinks((x) => ({ ...x, [p.id]: r.link! })); return r; }, 'Enlace listo')}>
                      {s ? 'Nuevo enlace' : 'Generar enlace'}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="small muted" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Enviado {fmtDateTime(current.sent_at)}{current.completed_at && ` · completado ${fmtDateTime(current.completed_at)}`}</span>
            {current.content_sha256 && <span className="mono" style={{ overflowWrap: 'anywhere' }}>SHA-256 {current.content_sha256}</span>}
          </div>
          {current.status === 'signed' && (isOwner || reps.some((w) => writer(w))) && (
            <div className="row" style={{ marginTop: 12 }}><button className="btn small" disabled={busy} onClick={() => run(() => resendFinal(current.id), 'Copia final enviada a todos')}>Reenviar copia final por correo</button></div>
          )}
        </section>
      )}

      {(agreements.length > 1 || log.length > 0) && (
        <section className="card glass">
          <header><h2>Bitácora</h2>{agreements.length > 1 && <span className="muted small">{agreements.length - 1} versión(es) anterior(es) anulada(s)</span>}</header>
          <ul className="log">
            {log.map((l) => (
              <li key={l.id}><span className="muted">{fmtDateTime(l.at)}</span><span>v{agreements.find((a) => a.id === l.entity_id)?.version} · {logText(l)}</span></li>
            ))}
          </ul>
        </section>
      )}

      {panel === 'edit' && (
        <Panel title="Datos del split" onClose={() => setPanel(null)}>
          <WorkForm work={work} workspaces={workspaces} canDelete={['owner', 'admin'].includes(roleIn(work.workspace_id) ?? '')} status={agreements.some((a) => a.status === 'signed') ? 'signed' : current?.status}
            onCancel={() => setPanel(null)} onSaved={() => { setPanel(null); setToast('Guardado'); router.refresh(); }} onDeleted={() => router.push('/splits')} />
        </Panel>
      )}
      {panel === 'letter' && model && (
        <Panel title="Carta de split" onClose={() => setPanel(null)} wide>
          <div className="paper-wrap"><Letter m={model} /></div>
          <footer><span className="muted small">{draft ? 'Vista previa: así se verá al enviarla.' : ''}</span><button className="btn primary" onClick={pdf} disabled={busy}>Descargar PDF</button></footer>
        </Panel>
      )}
      {panel && typeof panel === 'object' && (
        <ProfilePanel
          person={panel.profile === 'new' ? null : panel.profile}
          people={people}
          workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, slug: '' }))}
          memberships={memberships}
          preset={['songwriter']}
          reps={repList}
          onClose={() => setPanel(null)}
          onOpen={(p) => setPanel({ profile: p })}
          onDone={(msg, id) => {
            setPanel(null);
            if (panel.profile === 'new' && id && current && draft) run(() => addParticipant(current.id, id), 'Perfil creado y agregado');
            else { setToast(msg); router.refresh(); }
          }}
        />
      )}
      {note && current && (
        <Panel title="Pedir un cambio" onClose={() => setNote(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => decide(current.id, note.ws, 'changes_requested', note.text), 'Solicitud enviada', () => setNote(null)); }}>
            <label className="f">Qué hay que cambiar
              <textarea rows={3} autoFocus value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="Ej. Mariana lleva 40 %, no 30 %" />
            </label>
            <footer><span /><div className="row"><button type="button" className="btn" onClick={() => setNote(null)}>Cancelar</button><button className="btn primary" disabled={busy || !note.text.trim()}>Enviar</button></div></footer>
          </form>
        </Panel>
      )}
      <Toast msg={toast} />
    </div>
  );
}

function StatusPill({ a, participants, signatures }: { a: Agreement; participants: Participant[]; signatures: Signature[] }) {
  if (a.status === 'signed') return <span className="pill ok">v{a.version} · firmado</span>;
  if (a.status === 'sent') {
    const n = participants.filter((p) => signatures.find((s) => s.participant_id === p.id)?.status === 'signed').length;
    return <span className="pill warn">v{a.version} · {n}/{participants.length} firmas</span>;
  }
  if (a.status === 'void') return <span className="pill">v{a.version} · anulado</span>;
  return <span className="pill">v{a.version} · borrador</span>;
}

function AddParticipant({ people, busy, onAdd, onNew }: { people: Person[]; busy: boolean; onAdd: (id: string) => void; onNew: () => void }) {
  const [sel, setSel] = useState('');
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Agregar participante" style={{ maxWidth: 340 }}>
        <option value="">Agregar desde el directorio…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.legal_name}{p.credit_name ? ` (${p.credit_name})` : ''}</option>)}
      </select>
      <button className="btn" disabled={!sel || busy} onClick={() => { onAdd(sel); setSel(''); }}>Agregar</button>
      <button className="btn ghost" onClick={onNew}>+ Nuevo perfil</button>
    </div>
  );
}
