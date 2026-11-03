import Link from 'next/link';
import { requireSession, signedUrls } from '@/lib/session';
import { SUMMARY_SELECT, summarize, type AgreementSummary } from '@/lib/splitStatus';
import { buildReps, repLabel, type RepRow } from '@/lib/reps';
import { labelCopyStates, splitStates } from '@/lib/composition';
import { ASSET_COLS, RECORDING_COLS, checklist, fmtDate, missingOf, type Asset, type Recording, type WorkspaceLegal } from '@/lib/tracks';
import { daysUntil, greeting, longDate, nowInMexico } from '@/lib/greeting';
import TopBar from './components/TopBar';
import NotesCard, { type Note } from './components/NotesCard';
import Icon, { type IconName } from './components/Icon';
import { SearchButton } from './components/SearchPalette';

type Signer = { id: string; snapshot: { legal_name?: string; credit_name?: string } | null; signatures: { status: string; expires_at: string } | { status: string; expires_at: string }[] | null };
type Reminder = { key: string; text: string; href: string; urgency: number; tone: 'crit' | 'warn' | 'info' };

// en minúscula salvo siglas (WFH, ISRC)
const low = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const enDias = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);
const haceDias = (n: number) => (n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`);
const sigOf = (s: Signer['signatures']) => (Array.isArray(s) ? s[0] : s) ?? null;
const who = (p: Signer) => p.snapshot?.credit_name || p.snapshot?.legal_name?.split(' ')[0] || 'Alguien';

export default async function Home() {
  const { sb, user, memberships, name } = await requireSession();
  const mine = new Set(memberships.map((m) => m.workspace_id));
  const today = nowInMexico().ymd;
  const now = Date.now();

  const [works, ags, repRows, sent, wsQ, recQ, notesQ, logQ, allAgs, namesQ] = await Promise.all([
    sb.from('works').select('id, title, workspace_id, created_at'),
    sb.from('split_agreements').select(SUMMARY_SELECT).neq('status', 'void'),
    sb.rpc('workspace_reps'),
    sb.from('split_agreements').select('id, work_id, sent_at, split_participants(id, snapshot, signatures(status, expires_at))').eq('status', 'sent'),
    sb.from('workspaces').select('id, name, label_handles_legal'),
    sb.from('recordings').select(RECORDING_COLS),
    sb.from('notes').select('id, body, due_on, done_at, created_at').order('created_at'),   // si la migración no corre aún, falla sin romper
    sb.from('audit_events').select('id, action, detail, at, actor, workspace_id, entity_id').eq('entity', 'split').not('action', 'in', '(link_issued,final_sent)').order('at', { ascending: false }).limit(14),
    sb.from('split_agreements').select('id, work_id, version'),
    sb.from('memberships').select('user_id, display_name'),
  ]);
  const reps = buildReps((repRows.data ?? []) as RepRow[]);
  const workOf = (id: string) => (works.data ?? []).find((w) => w.id === id);
  const items = ((ags.data ?? []) as unknown as AgreementSummary[]).map((a) => {
    const w = workOf(a.work_id);
    return { a, w, s: summarize(a, w?.workspace_id ?? '', reps) };
  }).filter((x) => x.w);
  const toApprove = items.filter((x) => x.a.status === 'draft' && x.s.reps.some((r) => mine.has(r.ws) && r.state !== 'ok'));
  const changed = items.filter((x) => x.a.status === 'sent' && (x.a.change_requests?.length ?? 0) > 0 && mine.has(x.w!.workspace_id));
  const inSigning = items.filter((x) => x.a.status === 'sent' && !(x.a.change_requests?.length) && mine.has(x.w!.workspace_id));
  const drafts = items.filter((x) => x.a.status === 'draft' && mine.has(x.w!.workspace_id) && !toApprove.includes(x));

  // quién falta de firmar en cada split enviado
  const sentRows = (sent.data ?? []) as unknown as { id: string; work_id: string; sent_at: string | null; split_participants: Signer[] }[];
  const pendingOf = (workId: string) => {
    const a = sentRows.find((x) => x.work_id === workId);
    return { sentAt: a?.sent_at ?? null, people: (a?.split_participants ?? []).filter((p) => sigOf(p.signatures)?.status !== 'signed') };
  };

  // tracks: lo que falta y el próximo lanzamiento
  const recordings = ((recQ.data ?? []) as Recording[]).filter((r) => mine.has(r.workspace_id));
  const wsList = (wsQ.data ?? []) as WorkspaceLegal[];
  const [assetsQ, splits, lc] = recordings.length
    ? await Promise.all([
      sb.from('assets').select(ASSET_COLS).in('recording_id', recordings.map((r) => r.id)),
      splitStates(sb, recordings.filter((r) => r.work_id).map((r) => ({ id: r.work_id!, workspace_id: r.workspace_id }))),
      labelCopyStates(sb, recordings.map((r) => r.id), Object.fromEntries(recordings.map((r) => [r.id, r.work_id]))),
    ])
    : [{ data: [] }, {}, {}] as const;
  const assets = (assetsQ.data ?? []) as Asset[];
  const missing = (r: Recording) => missingOf(checklist(r, assets, wsList.find((w) => w.id === r.workspace_id), r.work_id ? (splits as Record<string, never>)[r.work_id] : undefined, (lc as Record<string, { ok: boolean; why: string }>)[r.id]));
  const incomplete = recordings.filter((r) => missing(r).length > 0);
  const upcoming = recordings.filter((r) => r.release_date && r.release_date >= today).sort((a, b) => a.release_date!.localeCompare(b.release_date!));
  const next = upcoming[0];
  const nextCover = next ? assets.find((a) => a.recording_id === next.id && a.kind === 'cover') : undefined;
  const thumbs = nextCover?.thumb_key ? await signedUrls(sb, [nextCover.thumb_key]) : {};

  // recordatorios automáticos, lo más urgente primero
  const reminders: Reminder[] = [];
  for (const r of upcoming) {
    const d = daysUntil(r.release_date!, today), m = missing(r);
    if (d <= 21 && m.length) reminders.push({ key: 'rel' + r.id, href: `/tracks/${r.id}`, urgency: 100 - d * 3, tone: d <= 7 ? 'crit' : 'warn',
      text: `“${r.title}” sale ${enDias(d)} y falta ${m.slice(0, 2).map((x) => low(x.label)).join(' y ')}${m.length > 2 ? ` (+${m.length - 2})` : ''}` });
  }
  for (const x of inSigning) {
    const p = pendingOf(x.w!.id);
    const days = p.sentAt ? Math.floor((now - Date.parse(p.sentAt)) / 86400000) : 0;
    for (const s of p.people) {
      const exp = sigOf(s.signatures)?.expires_at;
      const left = exp ? Math.ceil((Date.parse(exp) - now) / 86400000) : 99;
      if (left <= 5) reminders.push({ key: 'exp' + s.id, href: `/splits/${x.w!.id}`, urgency: 90 - left, tone: 'warn', text: left <= 0 ? `El enlace de ${who(s)} para “${x.w!.title}” ya venció` : `El enlace de ${who(s)} para “${x.w!.title}” vence ${enDias(left)}` });
      else if (days >= 3) reminders.push({ key: 'sig' + s.id, href: `/splits/${x.w!.id}`, urgency: 40 + Math.min(days, 30), tone: 'info', text: `${who(s)} lleva ${plural(days, 'día', 'días')} sin firmar “${x.w!.title}”` });
    }
  }
  for (const r of recordings) {
    if (!r.release_date || r.release_date >= today) continue;
    const ago = -daysUntil(r.release_date, today), m = missing(r);
    if (ago <= 45 && m.length) reminders.push({ key: 'out' + r.id, href: `/tracks/${r.id}`, urgency: 60, tone: 'crit', text: `“${r.title}” ya salió y le falta ${m.slice(0, 2).map((x) => low(x.label)).join(' y ')}` });
  }
  for (const x of drafts) {
    const age = Math.floor((now - Date.parse((x.w as { created_at?: string }).created_at ?? new Date().toISOString())) / 86400000);
    if (age >= 7) reminders.push({ key: 'dr' + x.a.id, href: `/splits/${x.w!.id}`, urgency: 10 + Math.min(age, 30), tone: 'info', text: `“${x.w!.title}” lleva ${plural(age, 'día', 'días')} en borrador` });
  }
  reminders.sort((a, b) => b.urgency - a.urgency);

  const attention = changed.length + toApprove.length;
  const summaryLine = memberships.length === 0 ? ''
    : attention ? `Tienes ${plural(attention, 'cosa', 'cosas')} por atender${inSigning.length ? ` y ${plural(inSigning.length, 'split', 'splits')} en firma` : ''}.`
      : inSigning.length ? `Nada urgente. ${plural(inSigning.length, 'split espera', 'splits esperan')} firmas.`
        : 'Todo al día.';

  type Row = { key: string; href: string; title: string; sub: string; pill: string; tone: string };
  const todo: Row[] = [
    ...changed.map((x) => ({ key: 'c' + x.a.id, href: `/splits/${x.w!.id}`, title: x.w!.title, sub: 'Un firmante pidió un cambio', pill: 'Pidieron cambio', tone: 'crit' })),
    ...toApprove.map((x) => ({ key: 'a' + x.a.id, href: `/splits/${x.w!.id}`, title: x.w!.title, sub: 'Revisa la parte de quien representas', pill: 'Te toca aprobar', tone: 'warn' })),
    ...inSigning.map((x) => {
      const p = pendingOf(x.w!.id);
      const names = p.people.map(who);
      return { key: 's' + x.a.id, href: `/splits/${x.w!.id}`, title: x.w!.title,
        sub: `${names.length ? `Falta ${names.slice(0, 2).join(' y ')}${names.length > 2 ? ` y ${names.length - 2} más` : ''}` : 'Firmando'}${p.sentAt ? ` · enviado ${haceDias(Math.floor((now - Date.parse(p.sentAt)) / 86400000))}` : ''}`,
        pill: x.s.label.replace(/^v\d+ · /, ''), tone: 'info' };
    }),
  ];

  // ---------- actividad reciente: bitácora de splits + tracks nuevos ----------
  const nameOf = new Map(((namesQ.data ?? []) as { user_id: string; display_name: string | null }[]).filter((m) => m.display_name).map((m) => [m.user_id, m.display_name!]));
  const agWork = new Map(((allAgs.data ?? []) as { id: string; work_id: string; version: number }[]).map((a) => [a.id, a]));
  const actor = (id: string | null, ws: string | null) => (id && id === user.id ? 'Tú' : (id && nameOf.get(id)) || (ws ? repLabel(reps, ws, (wsList.find((w) => w.id === ws) as { name?: string } | undefined)?.name ?? '') : '') || 'Alguien');
  const short = (n?: unknown) => String(n ?? '').trim().split(/\s+/).slice(0, 2).join(' ') || 'Un firmante';
  type Act = { key: string; at: string; icon: IconName; tone: string; who: string; what: string; title: string; href: string };
  const acts: Act[] = [];
  for (const e of (logQ.data ?? []) as { id: number; action: string; detail: Record<string, unknown> | null; at: string; actor: string | null; workspace_id: string | null; entity_id: string }[]) {
    const ag = agWork.get(e.entity_id), w = ag ? workOf(ag.work_id) : undefined;
    if (!w) continue;
    const base = { key: 'e' + e.id, at: e.at, title: w.title, href: `/splits/${w.id}` };
    const A: Record<string, [IconName, string, string, string]> = {
      created: ['doc', '', actor(e.actor, e.workspace_id), 'creó el split de'],
      sent: ['send', 'info', actor(e.actor, e.workspace_id), 'mandó a firma'],
      approved: ['shield', 'ok', actor(e.actor, e.workspace_id), 'aprobó'],
      changes_requested: ['message', 'warn', actor(e.actor, e.workspace_id), 'pidió cambios en'],
      change_requested: ['message', 'crit', 'Un firmante', 'pidió un cambio en'],
      signed: ['pen', 'ok', short(e.detail?.typed_name), 'firmó'],
      completed: ['checkCircle', 'ok', 'Todas las partes', 'firmaron'],
      new_version: ['refresh', '', actor(e.actor, e.workspace_id), `creó la versión ${ag?.version ?? ''} de`],
    };
    const m = A[e.action];
    // cuando fuiste tú: "Mandaste a firma…" en vez de "Tú mandó…"
    const TU: Record<string, string> = { created: 'Creaste el split de', sent: 'Mandaste a firma', approved: 'Aprobaste', changes_requested: 'Pediste cambios en', new_version: `Creaste la versión ${ag?.version ?? ''} de` };
    if (m && m[2] === 'Tú' && TU[e.action]) acts.push({ ...base, icon: m[0], tone: m[1], who: TU[e.action], what: '' });
    else if (m) acts.push({ ...base, icon: m[0], tone: m[1], who: m[2], what: m[3] });
  }
  for (const r of recordings) acts.push({ key: 'r' + r.id, at: r.created_at, icon: 'music', tone: '', who: 'Nuevo track', what: '', title: r.title, href: `/tracks/${r.id}` });
  acts.sort((a, b) => b.at.localeCompare(a.at));
  const ago = (iso: string) => {
    const m = Math.floor((now - Date.parse(iso)) / 60000);
    if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24); if (d === 1) return 'ayer'; if (d < 7) return `hace ${d} días`;
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' });
  };

  // ---------- números del resumen ----------
  const sigTotals = inSigning.reduce((t, x) => ({ s: t.s + x.s.signed, n: t.n + x.s.total }), { s: 0, n: 0 });
  const ready = recordings.length - incomplete.length;

  const Stat = ({ n, label, href, tone, icon, bar, foot }: { n: number; label: string; href: string; tone?: string; icon: IconName; bar?: number; foot?: string }) => (
    <Link href={href} className={`card glass stat${tone ? ` ${tone}` : ''}${n ? '' : ' zero'}`}>
      <span className="stat-ic"><Icon name={icon} size={17} /></span>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
      {bar !== undefined && <span className="stat-bar" aria-hidden="true"><i style={{ width: `${Math.round(bar * 100)}%` }} /></span>}
      {foot && <span className="stat-foot">{foot}</span>}
    </Link>
  );
  const Head = ({ icon, title, n, href, more }: { icon: IconName; title: string; n?: number; href?: string; more?: string }) => (
    <header><h2 className="h-ic"><span><Icon name={icon} size={16} /></span>{title}</h2>
      <span className="row" style={{ gap: 8 }}>{n ? <span className="pill">{n}</span> : null}{href && <Link href={href} className="see-all">{more ?? 'Ver todo'}<Icon name="arrow" size={13} /></Link>}</span></header>
  );

  return (
    <>
      <TopBar name={name} />
      <main className="wrap stack home">
        <section className="home-hero">
          <div className="hh-main">
            <p className="eyebrow">{longDate()}</p>
            <h1>{greeting(name)}</h1>
            {summaryLine && <p className="muted">{summaryLine}</p>}
          </div>
          {memberships.length > 0 && (
            <div className="hh-side">
              <SearchButton wide />
              <div className="quick">
                <Link href="/tracks?nuevo=1" className="quick-b"><span><Icon name="music" size={16} /></span>Nuevo track</Link>
                <Link href="/splits?nuevo=1" className="quick-b"><span><Icon name="doc" size={16} /></span>Split de sesión</Link>
                <Link href="/directorio?nuevo=1" className="quick-b"><span><Icon name="userPlus" size={16} /></span>Nuevo perfil</Link>
              </div>
            </div>
          )}
        </section>

        {memberships.length === 0 ? (
          <section className="card glass empty">
            <h2>Tu cuenta aún no tiene espacios</h2>
            <p>Pide a quien te invitó que te agregue a un espacio. Mientras tanto no verás ningún dato.</p>
          </section>
        ) : (
          <>
            <section className="stats" aria-label="Resumen">
              <Stat n={attention} label="Por atender" href="/splits" tone="crit" icon="alert" foot={attention ? [changed.length && `${changed.length} con cambio`, toApprove.length && `${toApprove.length} por aprobar`].filter(Boolean).join(' · ') : 'Nada urgente'} />
              <Stat n={inSigning.length} label="En firma" href="/splits" tone="warn" icon="pen" bar={sigTotals.n ? sigTotals.s / sigTotals.n : undefined} foot={sigTotals.n ? `${sigTotals.s} de ${sigTotals.n} firmas` : 'Sin splits en firma'} />
              <Stat n={drafts.length} label="Borradores" href="/splits" icon="layers" foot={drafts.length ? 'Sin enviar a firma' : 'Sin borradores'} />
              <Stat n={incomplete.length} label={incomplete.length === 1 ? 'Track por completar' : 'Tracks por completar'} href="/tracks" icon="music" bar={recordings.length ? ready / recordings.length : undefined} foot={recordings.length ? `${ready} de ${recordings.length} listos` : 'Sin tracks'} />
            </section>

            {next && (() => {
              const d = daysUntil(next.release_date!, today);
              const items = checklist(next, assets, wsList.find((w) => w.id === next.workspace_id), next.work_id ? (splits as Record<string, never>)[next.work_id] : undefined, (lc as Record<string, { ok: boolean; why: string }>)[next.id]).filter((i) => !i.optional);
              const thumb = nextCover?.thumb_key ? thumbs[nextCover.thumb_key] : undefined;
              const left = items.filter((i) => !i.ok).length;
              return (
                <Link href={`/tracks/${next.id}`} className={`release-banner${thumb ? '' : ' no-cover'}`}>
                  {thumb && <img className="rb-bg" src={thumb} alt="" aria-hidden="true" />}
                  <div className="rb-in">
                    {thumb ? <img className="rb-cover" src={thumb} alt="" /> : <span className="rb-cover blank" aria-hidden="true"><Icon name="disc" size={34} /></span>}
                    <div className="rb-main">
                      <span className="rb-eyebrow">Próximo lanzamiento · {fmtDate(next.release_date)}</span>
                      <b className="rb-title">{next.title}</b>
                      <span className="rb-sub">{next.main_artist}{next.release_title && next.release_title.toLowerCase() !== next.title.toLowerCase() ? ` · ${next.release_title}` : ''}</span>
                      <span className="rb-chips">
                        {items.map((i) => <span key={i.key} className={`rb-chip${i.ok ? ' ok' : ''}`}>{i.ok ? <Icon name="check" size={12} /> : <span className="rb-dot" />}{i.label}</span>)}
                      </span>
                    </div>
                    <div className="rb-count">
                      <span className="rb-n">{d === 0 ? '¡Hoy!' : d}</span>
                      {d > 0 && <span className="rb-u">{d === 1 ? 'día' : 'días'}</span>}
                      <span className="rb-state">{left ? `Faltan ${left}` : 'Listo'}</span>
                    </div>
                  </div>
                  {upcoming.length > 1 && <div className="rb-after">Después: {upcoming.slice(1, 3).map((r) => `${r.title} · ${fmtDate(r.release_date)}`).join('   ·   ')}</div>}
                </Link>
              );
            })()}

            <div className="dash-grid">
              <div className="stack">
                <section className="card glass">
                  <Head icon="doc" title="Splits en curso" n={todo.length} href="/splits" />
                  {todo.length ? (
                    <ul className="dash-list">
                      {todo.slice(0, 7).map((t) => (
                        <li key={t.key}><Link href={t.href}><span className={`dl-dot ${t.tone}`} /><span className="dl-main"><b>{t.title}</b><span className="muted small">{t.sub}</span></span><span className={`pill ${t.tone}`}>{t.pill}</span></Link></li>
                      ))}
                    </ul>
                  ) : <p className="muted small">Nada esperando por ti. Lo que mandes a firma aparece aquí.</p>}
                </section>
                <section className="card glass">
                  <Head icon="activity" title="Actividad reciente" />
                  {acts.length ? (
                    <ol className="timeline">
                      {acts.slice(0, 8).map((a) => (
                        <li key={a.key} className={a.tone}>
                          <span className="tl-ic"><Icon name={a.icon} size={14} /></span>
                          <Link href={a.href} className="tl-txt"><span><b>{a.who}</b>{a.what ? ` ${a.what} ` : ' '}<i>“{a.title}”</i></span><time dateTime={a.at}>{ago(a.at)}</time></Link>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="muted small">Aquí verás lo que vaya pasando: firmas, aprobaciones, tracks nuevos.</p>}
                </section>
              </div>

              <div className="stack">
                <NotesCard notes={(notesQ.data ?? []) as Note[]} today={today} ready={!notesQ.error} />
                <section className="card glass">
                  <Head icon="bell" title="Recordatorios" n={reminders.length || undefined} />
                  {reminders.length ? (
                    <ul className="reminders">
                      {reminders.slice(0, 5).map((r) => <li key={r.key} className={r.tone}><Link href={r.href}>{r.text}</Link></li>)}
                    </ul>
                  ) : <p className="muted small">Todo al día. Aquí te avisamos de lanzamientos cerca con cosas pendientes, firmas que tardan y enlaces por vencer.</p>}
                </section>
                {drafts.length > 0 && (
                  <section className="card glass">
                    <Head icon="layers" title="Borradores" n={drafts.length} />
                    <ul className="dash-list">
                      {drafts.slice(0, 5).map((x) => (
                        <li key={x.a.id}><Link href={`/splits/${x.w!.id}`}><span className={`dl-dot ${x.s.tone}`} /><span className="dl-main"><b>{x.w!.title}</b></span><span className={`pill ${x.s.tone}`}>{x.s.label.replace(/^v\d+ · /, '')}</span></Link></li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
