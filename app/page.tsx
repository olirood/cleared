import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { SUMMARY_SELECT, summarize, type AgreementSummary } from '@/lib/splitStatus';
import TopBar from './components/TopBar';

const ROLE: Record<string, string> = { owner: 'Dueño', admin: 'Administración', operator: 'Operación', viewer: 'Solo lectura' };

export default async function Home() {
  const { sb, memberships, name } = await requireSession();
  const mine = new Set(memberships.map((m) => m.workspace_id));
  const [ws, works, ags, recs] = await Promise.all([
    sb.from('workspaces').select('id, name, slug, letter_template').order('name'),
    sb.from('works').select('id, title, workspace_id'),
    sb.from('split_agreements').select(SUMMARY_SELECT).neq('status', 'void'),
    sb.from('recordings').select('id', { count: 'exact', head: true }),
  ]);
  const workOf = (id: string) => (works.data ?? []).find((w) => w.id === id);
  const items = ((ags.data ?? []) as unknown as AgreementSummary[]).map((a) => {
    const w = workOf(a.work_id);
    return { a, w, s: summarize(a, w?.workspace_id ?? '') };
  }).filter((x) => x.w);
  const toApprove = items.filter((x) => x.a.status === 'draft' && x.s.reps.some((r) => mine.has(r.ws) && r.state !== 'ok'));
  const inSigning = items.filter((x) => x.a.status === 'sent' && mine.has(x.w!.workspace_id));
  const drafts = items.filter((x) => x.a.status === 'draft' && mine.has(x.w!.workspace_id));
  const myWs = (ws.data ?? []).filter((w) => mine.has(w.id));
  const first = memberships.find((m) => m.display_name)?.display_name;

  const List = ({ title, rows, empty }: { title: string; rows: typeof items; empty: string }) => (
    <section className="card glass">
      <header><h2>{title}</h2><span className="pill">{rows.length}</span></header>
      {rows.length ? (
        <ul className="todo">
          {rows.slice(0, 8).map(({ w, s }) => (
            <li key={w!.id}><Link href={`/splits/${w!.id}`}>{w!.title}</Link><span className={`pill ${s.tone}`}>{s.label}</span></li>
          ))}
        </ul>
      ) : <p className="muted small">{empty}</p>}
    </section>
  );

  return (
    <>
      <TopBar name={name} />
      <main className="wrap stack">
        <div>
          <p className="eyebrow">Inicio</p>
          <h1>Hola{first ? `, ${first}` : ''}</h1>
        </div>

        {memberships.length === 0 ? (
          <section className="card glass empty">
            <h2>Tu cuenta aún no tiene espacios</h2>
            <p>Pide a quien te invitó que te agregue a un espacio. Mientras tanto no verás ningún dato.</p>
          </section>
        ) : (
          <>
            <section className="ws-grid" aria-label="Tus espacios">
              {myWs.map((w) => {
                const m = memberships.find((x) => x.workspace_id === w.id)!;
                return (
                  <article key={w.id} className="card glass ws-card">
                    <span className="mark">{w.name[0]}</span>
                    <div><h2>{w.name}</h2><p className="muted small">{ROLE[m.role] ?? m.role}{w.letter_template === 'apollo' ? ' · Carta de split de Apollo' : ''}</p></div>
                  </article>
                );
              })}
            </section>
            {toApprove.length > 0 && <List title="Te toca aprobar" rows={toApprove} empty="" />}
            <div className="folder-grid even">
              <List title="En firma" rows={inSigning} empty="Ningún split esperando firmas." />
              <List title="Borradores" rows={drafts} empty="Sin splits en borrador." />
            </div>
            <div className="row">
              <Link className="btn" href="/tracks">Tracks ({recs.count ?? 0})</Link>
              <Link className="btn" href="/splits">Splits ({items.length})</Link>
              <Link className="btn" href="/directorio">Directorio</Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
