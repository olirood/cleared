'use client';
// Buscador rápido: ⌘K / Ctrl+K o el botón de la lupa. Sin texto muestra atajos.
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from './Icon';
import { quickSearch, type Hit } from '../search-actions';

type Item = { key: string; icon: IconName; title: string; sub?: string; href: string; group: string };
const SHORTCUTS: Item[] = [
  { key: 'n-track', icon: 'plus', title: 'Nuevo track', href: '/tracks?nuevo=1', group: 'Crear' },
  { key: 'n-split', icon: 'plus', title: 'Nuevo split de sesión', href: '/splits?nuevo=1', group: 'Crear' },
  { key: 'n-perfil', icon: 'userPlus', title: 'Nuevo perfil', href: '/directorio?nuevo=1', group: 'Crear' },
  { key: 'g-home', icon: 'home', title: 'Inicio', href: '/', group: 'Ir a' },
  { key: 'g-tracks', icon: 'music', title: 'Tracks', href: '/tracks', group: 'Ir a' },
  { key: 'g-splits', icon: 'doc', title: 'Splits', href: '/splits', group: 'Ir a' },
  { key: 'g-dir', icon: 'user', title: 'Directorio', href: '/directorio', group: 'Ir a' },
  { key: 'g-cuenta', icon: 'settings', title: 'Cuenta', href: '/cuenta', group: 'Ir a' },
];
const KIND: Record<Hit['kind'], [IconName, string]> = { track: ['music', 'Tracks'], split: ['doc', 'Splits'], person: ['user', 'Personas'] };

export const openSearch = () => window.dispatchEvent(new Event('cleared:search'));

export function SearchButton({ wide = false }: { wide?: boolean }) {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return wide ? (
    <button type="button" className="search-trigger" onClick={openSearch}>
      <Icon name="search" size={17} /><span>Buscar track, split o persona…</span><kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  ) : (
    <button type="button" className="btn ghost small icon-only" onClick={openSearch} aria-label="Buscar (⌘K)" title={`Buscar (${mac ? '⌘' : 'Ctrl+'}K)`}><Icon name="search" size={17} /></button>
  );
}

export default function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    const ev = () => setOpen(true);
    window.addEventListener('keydown', key); window.addEventListener('cleared:search', ev);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('cleared:search', ev); };
  }, []);
  useEffect(() => { if (open) { setQ(''); setHits([]); setSel(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);

  // busca 180 ms después de dejar de escribir; ignora respuestas viejas
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const n = ++seq.current;
    const t = setTimeout(() => start(async () => { const r = await quickSearch(q); if (n === seq.current) { setHits(r); setSel(0); } }), 180);
    return () => clearTimeout(t);
  }, [q]);

  const items: Item[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return SHORTCUTS;
    const found = hits.map((h) => ({ key: h.kind + h.id, icon: KIND[h.kind][0], title: h.title, sub: h.sub, href: h.href, group: KIND[h.kind][1] }));
    const actions = SHORTCUTS.filter((s) => s.title.toLowerCase().includes(t));
    return [...found, ...actions];
  }, [q, hits]);

  const go = (it: Item) => { setOpen(false); router.push(it.href); };
  if (!open) return null;
  let lastGroup = '';
  return createPortal(
    <div className="palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="palette" role="dialog" aria-label="Buscar">
        <div className="palette-in">
          <Icon name="search" size={18} />
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca un track, un split o una persona…" aria-label="Buscar"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel]); }
            }} />
          {pending && <span className="palette-spin" aria-hidden="true" />}
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
            return (
              <li key={it.key} role="presentation">
                {head && <div className="palette-group">{head}</div>}
                <button type="button" role="option" aria-selected={i === sel} className="palette-item" onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
                  <span className="palette-ic"><Icon name={it.icon} size={16} /></span>
                  <span className="palette-txt"><b>{it.title}</b>{it.sub && <span>{it.sub}</span>}</span>
                  {i === sel && <Icon name="arrow" size={15} className="palette-go" />}
                </button>
              </li>
            );
          })}
          {q.trim().length >= 2 && !pending && hits.length === 0 && <li className="palette-empty">Nada con “{q.trim()}”.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
