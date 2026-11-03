import { cookies } from 'next/headers';
import { requireSession } from '@/lib/session';
import TopBar from '../components/TopBar';
import PasswordForm from './form';
import ThemePicker, { type Theme } from './ThemePicker';
import { AccountForm, OtherSessions } from './AccountForm';

const ROLE: Record<string, string> = { owner: 'Dueño', admin: 'Administración', operator: 'Operación', viewer: 'Solo lectura' };

export const metadata = { title: 'Cuenta · Cleared' };

export default async function Cuenta() {
  const { sb, user, memberships: data, name, color } = await requireSession();
  const { data: ws } = await sb.from('workspaces').select('id, name');
  const t = (await cookies()).get('cleared-theme')?.value;
  const theme: Theme = t === 'light' || t === 'dark' ? t : 'auto';
  return (
    <>
      <TopBar name={name} />
      <main className="wrap stack">
        <div>
          <h1>{name}</h1>
          <p className="muted">{user.email}</p>
        </div>
        <section className="card glass">
          <header><h2>Tu perfil</h2></header>
          <AccountForm name={name === user.email ? '' : name} color={color} />
        </section>
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
        <section className="card glass">
          <header><h2>Sesiones</h2></header>
          <OtherSessions />
        </section>
      </main>
    </>
  );
}
