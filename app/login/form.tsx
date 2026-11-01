'use client';
import { useActionState } from 'react';
import { signIn } from '../actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="login-form">
      <label className="f">Correo
        <input type="email" name="email" autoComplete="email" required autoFocus />
      </label>
      <label className="f">Contraseña
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="form-msg crit" role="alert">{state.error}</p>}
      <button className="btn primary wide" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
