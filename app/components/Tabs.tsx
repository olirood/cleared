'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [['/', 'Inicio'], ['/tracks', 'Tracks'], ['/splits', 'Splits'], ['/directorio', 'Directorio']] as const;

export default function Tabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Secciones">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={(href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
