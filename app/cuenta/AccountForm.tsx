'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AVATAR_COLORS, avatarInk, initialsOf } from '@/lib/avatar';
import { saveAccount, signOutOthers } from './actions';

export function AccountForm({ name: initialName, color: initialColor }: { name: string; color: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [pending, start] = useTransition();
  const dirty = name.trim() !== initialName || color !== initialColor;
  return (
    <form className="stack" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); setMsg({}); start(async () => { const r = await saveAccount(name, color); if (r.error) setMsg({ err: r.error }); else { setMsg({ ok: 'Guardado' }); router.refresh(); } }); }}>
      <div className="acct-row">
        <span className="avatar xl" style={color ? { background: color, color: avatarInk(color), borderColor: 'transparent' } : undefined} aria-hidden="true">{initialsOf(name || '·')}</span>
        <label className="f" style={{ flex: 1 }}>Nombre visible
          <span className="hint">Sale arriba, en “Lo representa” y en los correos. No cambia tu nombre en los splits.</span>
          <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        </label>
      </div>
      <div className="f">
        <span className="flabel">Color de tu inicial</span>
        <div className="swatches" role="radiogroup" aria-label="Color de tu inicial">
          <button type="button" role="radio" aria-checked={color === null} className="swatch none" title="Sin color" onClick={() => setColor(null)} />
          {AVATAR_COLORS.map(([hex, label]) => (
            <button key={hex} type="button" role="radio" aria-checked={color === hex} className="swatch" title={label} aria-label={label} style={{ background: hex }} onClick={() => setColor(hex)} />
          ))}
        </div>
      </div>
      {msg.err && <p className="form-msg crit" role="alert">{msg.err}</p>}
      {msg.ok && !dirty && <p className="form-msg ok" role="status">{msg.ok}</p>}
      <div><button className="btn primary" disabled={pending || !dirty || !name.trim()}>{pending ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  );
}

export function OtherSessions() {
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="muted small" style={{ margin: 0 }}>Si entraste en otra computadora o en un celular que no es tuyo, ciérrala desde aquí. Esta sesión sigue abierta.</p>
      {msg.err && <p className="form-msg crit" role="alert">{msg.err}</p>}
      {msg.ok && <p className="form-msg ok" role="status">{msg.ok}</p>}
      <div>
        <button type="button" className={`btn${armed ? ' danger armed' : ''}`} disabled={pending}
          onClick={() => armed ? start(async () => { setArmed(false); const r = await signOutOthers(); setMsg(r.error ? { err: r.error } : { ok: 'Listo: se cerró tu sesión en los demás dispositivos.' }); }) : setArmed(true)}>
          {pending ? 'Cerrando…' : armed ? 'Confirmar: cerrar las demás' : 'Cerrar sesión en otros dispositivos'}</button>
      </div>
    </div>
  );
}
