'use client';
import { useActionState } from 'react';
import { changePassword } from '../actions';

export default function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="stack" style={{ maxWidth: 420 }}>
      <label className="f">Nueva contraseña
        <span className="hint">Mínimo 12 caracteres. Una frase larga es más fácil de recordar.</span>
        <input type="password" name="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="f">Repítela
        <input type="password" name="again" autoComplete="new-password" minLength={12} required />
      </label>
      {state?.error && <p className="form-msg crit" role="alert">{state.error}</p>}
      {state?.done && <p className="form-msg ok" role="status">{state.done}</p>}
      <div><button className="btn primary" disabled={pending}>{pending ? 'Guardando…' : 'Cambiar contraseña'}</button></div>
    </form>
  );
}
