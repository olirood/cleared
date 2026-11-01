import { signingView } from './actions';
import SignView from './SignView';

export const metadata = { title: 'Firma de split · Cleared', robots: { index: false, follow: false } };

export default async function FirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await signingView(token);
  return (
    <main className="wrap signer" style={{ paddingBlock: '24px 80px' }}>
      <div className="signbar"><span className="mark">C</span><b>Cleared</b><span className="muted small">· Firma de split</span></div>
      {view ? <SignView token={token} view={view} /> : (
        <section className="card glass empty">
          <h2>Este enlace no es válido</h2>
          <p>Puede que se haya generado uno nuevo o que el split cambió de versión. Pide el enlace otra vez a quien te lo mandó.</p>
        </section>
      )}
    </main>
  );
}
