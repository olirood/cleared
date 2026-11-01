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
      </div>
    </main>
  );
}
