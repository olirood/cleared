import { signingView } from './actions';
import SignView from './SignView';

export const metadata = { title: 'Split sheet · Cleared', robots: { index: false, follow: false } };

export default async function FirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await signingView(token);
  return (
    <main className="wrap signer" style={{ paddingBlock: '24px 80px' }}>
      <div className="signbar"><span className="mark">C</span><b>Cleared</b><span className="muted small">· Split sheet</span></div>
      {view ? <SignView token={token} view={view} /> : (
        <section className="card glass empty">
          <h2>Este enlace no es válido · This link is not valid</h2>
          <p>Puede que se haya generado uno nuevo o que el split cambió de versión. Pide el enlace otra vez a quien te lo mandó.</p>
          <p lang="en">A new link may have been issued or the split may have a new version. Ask the person who sent it for the link again.</p>
        </section>
      )}
    </main>
  );
}
