'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Letter from '../../components/Letter';
import { downloadBlob, fileSafe, letterPdf, rowFrom, type LetterModel } from '@/lib/letter';
import { fmtPct, fmtDateTime, ROLES } from '@/lib/splits';
import { requestChange, requestCode, sign, type SigningView } from './actions';

export default function SignView({ token, view }: { token: string; view: SigningView }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'sign' | 'change' | 'sent'>('sign');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const me = view.participants.find((p) => p.id === view.me)!;
  const a = view.agreement;

  const model: LetterModel = {
    title: view.work.title, artist: view.work.artist || '', version: a.version, status: a.status,
    date: view.work.session_date || (a.sent_at || new Date().toISOString()).slice(0, 10), template: view.workspace.template, workspace: view.workspace.name,
    rows: view.participants.map((p) => rowFrom({ role: p.role, share_bp: p.share_bp, credits: p.credits,
      snap: { legal_name: p.legal_name, credit_name: p.credit_name, publisher: p.publisher, pro: p.pro, ipi: p.ipi },
      sig: p.signed ? { status: 'signed', signed_at: p.signed_at, typed_name: p.legal_name } : null })),
    hash: a.content_sha256, sentAt: a.sent_at, completedAt: a.completed_at, log: [],
  };
  const pdf = () => start(async () => downloadBlob(await letterPdf(model), `Split ${fileSafe(view.work.title)} v${a.version}.pdf`));

  const closed = view.my_status === 'void' || view.my_status === 'expired' || a.status === 'void';

  return (
    <div className="stack">
      <section className="card glass">
        <p className="eyebrow">{view.workspace.name} te pide firmar</p>
        <h1 style={{ fontSize: '1.5rem' }}>“{view.work.title}”</h1>
        <p className="muted">{view.work.artist}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="pill info">Tu parte: {fmtPct(me.share_bp)} % · {ROLES[me.role as keyof typeof ROLES] ?? me.role}</span>
          <span className="pill">{view.participants.filter((p) => p.signed).length}/{view.participants.length} firmas</span>
        </div>
      </section>

      {view.my_status === 'signed' ? (
        <div className="banner info"><span><b>Ya firmaste</b> el {fmtDateTime(view.signed_at)}. {a.status === 'signed' ? 'Firmaron todas las partes; te mandamos la copia final a tu correo.' : 'Cuando firmen todos, te llega la copia final a tu correo.'}</span>
          <button className="btn" onClick={pdf} disabled={pending}>Descargar copia</button></div>
      ) : closed ? (
        <div className="banner crit"><span>{view.my_status === 'expired' ? 'Este enlace caducó. Pide uno nuevo a quien te lo mandó.' : 'Esta versión del split ya no está vigente. Te mandarán un enlace nuevo.'}</span></div>
      ) : null}

      <div className="paper-wrap"><Letter m={model} /></div>

      {!closed && view.my_status === 'pending' && mode === 'sign' && (
        <section className="card glass">
          <header><h2>Firmar</h2></header>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await sign(token, code, name, consent); if (r.error) setErr(r.error); else router.refresh(); }); }}>
            <div className="code-step">
              <div>
                <b>1. Pide tu código</b>
                <p className="muted small">Te lo mandamos a {view.email_hint ?? 'tu correo'}. Vence en 10 minutos.</p>
              </div>
              <button type="button" className="btn" disabled={pending}
                onClick={() => { setErr(''); setInfo(''); start(async () => { const r = await requestCode(token); if (r.error) setErr(r.error); else { setCodeSent(true); setInfo('Listo, revisa tu correo (y la carpeta de spam).'); } }); }}>
                {codeSent ? 'Mandar otro' : 'Mandar código'}</button>
            </div>
            {info && <p className="form-msg ok" role="status">{info}</p>}
            <label className="f">2. Código de 6 dígitos
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-in" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={!codeSent} />
            </label>
            <label className="f">3. Escribe tu nombre completo
              <span className="hint">Tal como aparece en la carta: {me.legal_name}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Leí la carta y acepto firmarla por medios electrónicos. Mi nombre escrito, junto con este enlace personal, la fecha, la hora y mi dirección IP, valen como mi firma (Código de Comercio, arts. 89 a 93).</span>
            </label>
            {err && <p className="form-msg crit" role="alert">{err}</p>}
            <div className="row spread">
              <button type="button" className="btn ghost" onClick={() => { setErr(''); setMode('change'); }}>Algo está mal: pedir un cambio</button>
              <button className="btn primary" disabled={pending || !consent || !name.trim() || code.length !== 6}>{pending ? 'Firmando…' : 'Firmar'}</button>
            </div>
          </form>
        </section>
      )}
      {!closed && view.my_status === 'pending' && mode === 'change' && (
        <section className="card glass">
          <header><h2>Pedir un cambio</h2></header>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await requestChange(token, note); if (r.error) setErr(r.error); else setMode('sent'); }); }}>
            <label className="f">Qué hay que cambiar
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Mi IPI está mal, o mi porcentaje es otro" required />
            </label>
            {err && <p className="form-msg crit" role="alert">{err}</p>}
            <div className="row spread">
              <button type="button" className="btn ghost" onClick={() => setMode('sign')}>Volver a firmar</button>
              <button className="btn primary" disabled={pending}>Enviar</button>
            </div>
          </form>
        </section>
      )}
      {mode === 'sent' && <div className="banner info"><span><b>Listo.</b> {view.workspace.name} recibió tu comentario y te mandará una versión corregida.</span></div>}
    </div>
  );
}
