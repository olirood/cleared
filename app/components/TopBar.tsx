import Link from 'next/link';
import { signOut } from '../actions';

export default function TopBar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·';
  return (
    <header className="top wrap">
      <div className="bar-shell">
        <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="mark">C</span><b className="wordmark">Cleared</b>
        </Link>
        <span />
        <div className="bar-end">
          <Link href="/cuenta" className="btn ghost small">Cuenta</Link>
          <form action={signOut}><button className="btn ghost small">Salir</button></form>
          <span className="avatar" title={name}>{initials}</span>
        </div>
      </div>
    </header>
  );
}
