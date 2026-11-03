'use client';
// Tema del sitio: automático (como el sistema), claro u oscuro. Se guarda en una cookie
// para que la página llegue ya con el tema correcto, sin parpadeo.
import { useState } from 'react';

export type Theme = 'auto' | 'light' | 'dark';
const OPTS: [Theme, string][] = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']];

export default function ThemePicker({ initial }: { initial: Theme }) {
  const [t, setT] = useState<Theme>(initial);
  const pick = (v: Theme) => {
    setT(v);
    document.cookie = v === 'auto' ? 'cleared-theme=; path=/; max-age=0; samesite=lax' : `cleared-theme=${v}; path=/; max-age=31536000; samesite=lax`;
    if (v === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', v);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="seg theme-pick" role="group" aria-label="Tema">
        {OPTS.map(([v, l]) => <button key={v} type="button" className="seg-b" aria-pressed={t === v} onClick={() => pick(v)}>{l}</button>)}
      </div>
      <p className="muted small">{t === 'auto' ? 'Sigue el modo claro u oscuro de tu computadora o celular.' : 'Se queda así en este navegador.'}</p>
    </div>
  );
}
