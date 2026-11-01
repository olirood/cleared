import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import TopBar from '../components/TopBar';
import PasswordForm from './form';

export const metadata = { title: 'Cuenta · Cleared' };

export default async function Cuenta() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await sb.from('memberships').select('display_name').eq('user_id', user.id).limit(1);
  const name = data?.[0]?.display_name || user.email || '';
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
          <header><h2>Contraseña</h2></header>
          <PasswordForm />
        </section>
      </main>
    </>
  );
}
