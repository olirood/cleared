import Link from 'next/link';
import { signOut } from '../actions';
import { currentSession } from '@/lib/session';
import { avatarInk, initialsOf } from '@/lib/avatar';
import Tabs from './Tabs';

export default async function TopBar({ name: given }: { name?: string }) {
  const s = await currentSession();
  const name = s?.name || given || '';
  const color = s?.color;
  return (
    <header className="top wrap">
      <div className="bar-shell">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="mark">C</span><b className="wordmark">Cleared</b>
        </Link>
        <Tabs />
        <div className="bar-end">
          <Link href="/cuenta" className="btn ghost small">Cuenta</Link>
          <form action={signOut}><button className="btn ghost small">Salir</button></form>
          <Link href="/cuenta" className="avatar" title={name} aria-label="Tu cuenta"
            style={color ? { background: color, color: avatarInk(color), borderColor: 'transparent' } : undefined}>{initialsOf(name)}</Link>
        </div>
      </div>
    </header>
  );
}
