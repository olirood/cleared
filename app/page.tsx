import Link from 'next/link';
import { requireSession, signedUrls } from '@/lib/session';
import { SUMMARY_SELECT, summarize, type AgreementSummary } from '@/lib/splitStatus';
import { buildReps, type RepRow } from '@/lib/reps';
import { labelCopyStates, splitStates } from '@/lib/composition';
import { ASSET_COLS, RECORDING_COLS, checklist, fmtDate, missingOf, type Asset, type Recording, type WorkspaceLegal } from '@/lib/tracks';
import { daysUntil, greeting, longDate, nowInMexico } from '@/lib/greeting';
import TopBar from './components/TopBar';
import NotesCard, { type Note } from './components/NotesCard';

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
  const { sb, memberships, name } = await requireSession();
  const mine = new Set(memberships.map((m) => m.workspace_id));
  const today = nowInMexico().ymd;
  const now = Date.now();

  const [works, ags, repRows, sent, wsQ, recQ, notesQ] = await Promise.all([
    sb.from('works').select('id, title, workspace_id, created_at'),
    sb.from('split_agreements').select(SUMMARY_SELECT).neq('status', 'void'),
    sb.rpc('workspace_reps'),
    sb.from('split_agreements').select('id, work_id, sent_at, split_participants(id, snapshot, signatures(status, expires_at))').eq('status', 'sent'),
    sb.from('workspaces').select('id, name, label_handles_legal'),
    sb.from('recordings').select(RECORDING_COLS),
    sb.from('notes').select('id, body, due_on, done_at, created_at').order('created_at'),   // si la migración no corre aún, falla sin romper
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

  const Stat = ({ n, label, href, tone }: { n: number; label: string; href: string; tone?: string }) => (
    <Link href={href} className={`card glass stat${n && tone ? ` ${tone}` : ''}`}><span className="stat-n">{n}</span><span className="stat-l">{label}</span></Link>
  );

  return (
    <>
      <TopBar name={name} />
      <main className="wrap stack home">
        <section className="home-hero">
          <p className="eyebrow">{longDate()}</p>
          <h1>{greeting(name)}</h1>
          {summaryLine && <p className="muted">{summaryLine}</p>}
        </section>

        {memberships.length === 0 ? (
          <section className="card glass empty">
            <h2>Tu cuenta aún no tiene espacios</h2>
            <p>Pide a quien te invitó que te agregue a un espacio. Mientras tanto no verás ningún dato.</p>
          </section>
        ) : (
          <>
            <section className="stats" aria-label="Resumen">
              <Stat n={attention} label="Por atender" href="/splits" tone="crit" />
              <Stat n={inSigning.length} label="En firma" href="/splits" tone="warn" />
              <Stat n={drafts.length} label="Borradores" href="/splits" />
              <Stat n={incomplete.length} label={incomplete.length === 1 ? 'Track por completar' : 'Tracks por completar'} href="/tracks" />
            </section>

            <div className="dash-grid">
              <div className="stack">
                <section className="card glass">
                  <header><h2>Splits en curso</h2>{todo.length > 0 && <span className="pill">{todo.length}</span>}</header>
                  {todo.length ? (
                    <ul className="dash-list">
                      {todo.slice(0, 8).map((t) => (
                        <li key={t.key}><Link href={t.href}><span className="dl-main"><b>{t.title}</b><span className="muted small">{t.sub}</span></span><span className={`pill ${t.tone}`}>{t.pill}</span></Link></li>
                      ))}
                    </ul>
                  ) : <p className="muted small">Nada esperando por ti. Lo que mandes a firma aparece aquí.</p>}
                </section>
                <NotesCard notes={(notesQ.data ?? []) as Note[]} today={today} ready={!notesQ.error} />
                {drafts.length > 0 && (
                  <section className="card glass">
                    <header><h2>Borradores</h2><span className="pill">{drafts.length}</span></header>
                    <ul className="dash-list">
                      {drafts.slice(0, 6).map((x) => (
                        <li key={x.a.id}><Link href={`/splits/${x.w!.id}`}><span className="dl-main"><b>{x.w!.title}</b></span><span className={`pill ${x.s.tone}`}>{x.s.label.replace(/^v\d+ · /, '')}</span></Link></li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <div className="stack">
                {next && (() => {
                  const d = daysUntil(next.release_date!, today), m = missing(next);
                  const thumb = nextCover?.thumb_key ? thumbs[nextCover.thumb_key] : undefined;
                  return (
                    <Link href={`/tracks/${next.id}`} className="card glass release">
                      <p className="eyebrow">Próximo lanzamiento</p>
                      <div className="rel-row">
                        {thumb ? <img className="rel-cover" src={thumb} alt="" /> : <span className="rel-cover blank" aria-hidden="true">{next.title.trim()[0]?.toUpperCase()}</span>}
                        <div className="rel-main">
                          <b>{next.title}</b>
                          <span className="muted small">{next.main_artist}{next.release_title && next.release_title.toLowerCase() !== next.title.toLowerCase() ? ` · ${next.release_title}` : ''}</span>
                          <span className="rel-when"><span className="rel-days">{d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `${d} días`}</span><span className="muted small">{fmtDate(next.release_date)}</span></span>
                        </div>
                      </div>
                      <p className={`rel-state ${m.length ? 'warn' : 'ok'}`}>{m.length ? `Falta ${m.map((x) => low(x.label)).join(', ')}` : 'Listo para entregar'}</p>
                      {upcoming.length > 1 && <p className="muted small" style={{ margin: 0 }}>Después: {upcoming.slice(1, 3).map((r) => `${r.title} (${fmtDate(r.release_date)})`).join(' · ')}</p>}
                    </Link>
                  );
                })()}
                <section className="card glass">
                  <header><h2>Recordatorios</h2></header>
                  {reminders.length ? (
                    <ul className="reminders">
                      {reminders.slice(0, 5).map((r) => <li key={r.key} className={r.tone}><Link href={r.href}>{r.text}</Link></li>)}
                    </ul>
                  ) : <p className="muted small">Todo al día. Aquí te avisamos de lanzamientos cerca con cosas pendientes, firmas que tardan y enlaces por vencer.</p>}
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
