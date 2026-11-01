import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import TopBar from './components/TopBar';

const ROLE: Record<string, string> = { owner: 'Dueño', admin: 'Administración', operator: 'Operación', viewer: 'Solo lectura' };
const NEXT: [string, boolean][] = [['Directorio', true], ['Tracks y carpetas', true], ['Splits y aprobaciones', false], ['Label copy', false], ['Firmas', false]];

type Row = { role: string; display_name: string | null; workspaces: { name: string; slug: string; letter_template: string } | null };

export default async function Home() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await sb
    .from('memberships')
    .select('role, display_name, workspaces(name, slug, letter_template)')
    .eq('user_id', user.id)
    .order('created_at');
  const rows = (data ?? []) as unknown as Row[];
  const name = rows.find((r) => r.display_name)?.display_name || user.email || '';

  return (
    <>
      <TopBar name={name} />
      <main className="wrap stack">
        <div>
          <p className="eyebrow">Inicio</p>
          <h1>Hola{rows[0]?.display_name ? `, ${rows[0].display_name}` : ''}</h1>
        </div>

        {rows.length === 0 ? (
          <section className="card glass empty">
            <h2>Tu cuenta aún no tiene espacios</h2>
            <p>Pide a quien te invitó que te agregue a un espacio. Mientras tanto no verás ningún dato.</p>
          </section>
        ) : (
          <section className="ws-grid" aria-label="Tus espacios">
            {rows.map((r) => r.workspaces && (
              <article key={r.workspaces.slug} className="card glass ws-card">
                <span className="mark">{r.workspaces.name[0]}</span>
                <div>
                  <h2>{r.workspaces.name}</h2>
                  <p className="muted small">
                    {ROLE[r.role] ?? r.role}
                    {r.workspaces.letter_template === 'apollo' ? ' · Carta de split de Apollo' : ''}
                  </p>
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="card glass">
          <header><h2>En camino</h2><span className="pill">Se pasan del demo uno por uno</span></header>
          <ul className="todo">
            {NEXT.map(([n, ready]) => <li key={n}><span>{n}</span>{ready ? <span className="pill ok">Listo</span> : <span className="pill">Pendiente</span>}</li>)}
          </ul>
        </section>
      </main>
    </>
  );
}
