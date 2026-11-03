import LoginForm from './form';

export const metadata = { title: 'Entrar · Cleared' };

export default function LoginPage() {
  return (
    <main className="wrap login">
      <div className="login-card glass">
        <span className="mark lg">C</span>
        <h1>Cleared</h1>
        <p className="muted">Splits, label copy y firmas. Solo con invitación.</p>
        <LoginForm />
        <p className="login-note">¿Te mandaron un enlace para firmar? No necesitas cuenta: vuelve a abrir el enlace que te llegó por WhatsApp.</p>
      </div>
    </main>
  );
}
