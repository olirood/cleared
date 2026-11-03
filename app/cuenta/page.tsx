import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import TopBar from '../components/TopBar';
import PasswordForm from './form';
import ThemePicker, { type Theme } from './ThemePicker';

const ROLE: Record<string, string> = { owner: 'Dueño', admin: 'Administración', operator: 'Operación', viewer: 'Solo lectura' };

export const metadata = { title: 'Cuenta · Cleared' };

export default async function Cuenta() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const [{ data }, { data: ws }] = await Promise.all([
    sb.from('memberships').select('workspace_id, role, display_name').eq('user_id', user.id).order('created_at'),
    sb.from('workspaces').select('id, name'),
  ]);
  const name = data?.find((m) => m.display_name)?.display_name || user.email || '';
  const t = (await cookies()).get('cleared-theme')?.value;
  const theme: Theme = t === 'light' || t === 'dark' ? t : 'auto';
  return (
    <>
      <TopBar name={name} />
      <main className="wrap stack">
        <div>
          <p className="eyebrow">Cuenta</p>
          <h1>{name}</h1>
          <p className="muted">{user.email}</p>
        </div>
        <section className="card glass">
          <header><h2>Apariencia</h2></header>
          <ThemePicker initial={theme} />
        </section>
        <section className="card glass">
          <header><h2>Tus espacios</h2></header>
          <ul className="todo">
            {(data ?? []).map((m) => (
              <li key={m.workspace_id}><span>{ws?.find((w) => w.id === m.workspace_id)?.name ?? 'Espacio'}</span><span className="pill">{ROLE[m.role] ?? m.role}</span></li>
            ))}
          </ul>
        </section>
        <section className="card glass">
          <header><h2>Contraseña</h2></header>
          <PasswordForm />
        </section>
      </main>
    </>
  );
}
