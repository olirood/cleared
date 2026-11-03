'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Letter from '../../components/Letter';
import SignaturePad from '../../components/SignaturePad';
import Panel from '../../components/Panel';
import { AVISOS, avisoPdf, type Lang } from '@/lib/aviso';
import { downloadBlob, fileSafe, letterPdf, rowFrom, fmtStamp, type LetterModel } from '@/lib/letter';
import { fmtPct, ROLES, ROLE_EN } from '@/lib/splits';
import { requestChange, requestCode, sign, type SigningView } from './actions';

// Textos de la pantalla de firma; quien firma elige el idioma (la carta va en el idioma del split)
const T = {
  es: {
    asks: (ws: string) => `${ws} te pide firmar`, share: 'Tu parte', sigs: 'firmas',
    signed: (d: string) => <><b>Ya firmaste</b> el {d}.</>, allSigned: 'Firmaron todas las partes; te mandamos la copia final a tu correo.', willGet: 'Cuando firmen todos, te llega la copia final a tu correo.',
    download: 'Descargar copia', expired: 'Este enlace caducó. Pide uno nuevo a quien te lo mandó.', voided: 'Esta versión del split ya no está vigente. Te mandarán un enlace nuevo.',
    sign: 'Firmar', viewNotice: 'Ver aviso', before: 'Antes de firmar', read: 'Lee el', readAfter: ': cómo funciona tu firma, cómo obtener tus copias, qué hacer si algo está mal y cómo se usan tus datos.',
    agree: 'Acepto usar documentos y firmas electrónicas, y el uso de mis datos descrito en el aviso.', change: 'Pedir un cambio', cont: 'Continuar',
    s1: '1. Pide tu código', s1hint: (e: string) => `Te lo mandamos a ${e}. Vence en 10 minutos.`, yourEmail: 'tu correo', send: 'Mandar código', resend: 'Mandar otro', sentOk: 'Listo, revisa tu correo (y la carpeta de spam).',
    s2: '2. Código de 6 dígitos', s3: '3. Escribe tu nombre completo', s3hint: (n: string) => `Tal como aparece en la carta: ${n}`,
    s4: '4. Cómo se ve tu firma', withName: 'Con mi nombre', draw: 'Dibujarla', padHint: 'Firma aquí con el dedo o el mouse', padClear: 'Borrar', padLabel: 'Dibuja tu firma',
    final: (drawn: boolean) => `Leí la carta y la firmo. ${drawn ? 'Mi firma dibujada y mi nombre escrito' : 'Mi nombre escrito'}, junto con este enlace personal, la fecha, la hora y mi dirección IP, valen como mi firma (Código de Comercio, arts. 89 a 93).`,
    signing: 'Firmando…', changeTitle: 'Pedir un cambio', what: 'Qué hay que cambiar', whatPh: 'Ej. Mi IPI está mal, o mi porcentaje es otro', back: 'Volver a firmar', submit: 'Enviar',
    sentNote: (ws: string) => <><b>Listo.</b> {ws} ya puede ver tu comentario. Cuando lo corrijan te mandarán un enlace nuevo para firmar.</>,
    dl: 'Descargar PDF', print: 'Imprimir', gotIt: 'Lo leí', letterIn: 'La carta está en inglés.', letterInEs: 'La carta está en español.',
  },
  en: {
    asks: (ws: string) => `${ws} is asking you to sign`, share: 'Your share', sigs: 'signatures',
    signed: (d: string) => <><b>You signed</b> on {d}.</>, allSigned: 'All parties have signed; we emailed you the final copy.', willGet: 'Once everyone signs, the final copy will arrive in your email.',
    download: 'Download copy', expired: 'This link has expired. Ask the person who sent it for a new one.', voided: 'This version of the split is no longer valid. You will receive a new link.',
    sign: 'Sign', viewNotice: 'View notice', before: 'Before you sign', read: 'Read the', readAfter: ': how your signature works, how to get your copies, what to do if something is wrong and how your data is used.',
    agree: 'I agree to use electronic documents and signatures, and to the use of my data described in the notice.', change: 'Request a change', cont: 'Continue',
    s1: '1. Get your code', s1hint: (e: string) => `We’ll send it to ${e}. It expires in 10 minutes.`, yourEmail: 'your email', send: 'Send code', resend: 'Send another', sentOk: 'Done, check your email (and your spam folder).',
    s2: '2. 6-digit code', s3: '3. Type your full name', s3hint: (n: string) => `Exactly as it appears in the letter: ${n}`,
    s4: '4. How your signature looks', withName: 'Use my name', draw: 'Draw it', padHint: 'Sign here with your finger or mouse', padClear: 'Clear', padLabel: 'Draw your signature',
    final: (drawn: boolean) => `I have read the letter and I sign it. ${drawn ? 'My drawn signature and typed name' : 'My typed name'}, together with this personal link, the date, time and my IP address, constitute my signature (Mexican Commercial Code, arts. 89 to 93).`,
    signing: 'Signing…', changeTitle: 'Request a change', what: 'What needs to change', whatPh: 'E.g. my IPI is wrong, or my percentage is different', back: 'Back to signing', submit: 'Send',
    sentNote: (ws: string) => <><b>Done.</b> {ws} can now see your comment. Once it’s fixed you’ll get a new link to sign.</>,
    dl: 'Download PDF', print: 'Print', gotIt: 'I’ve read it', letterIn: 'The letter is in English.', letterInEs: 'The letter is in Spanish.',
  },
};

export default function SignView({ token, view }: { token: string; view: SigningView }) {
  const router = useRouter();
  // idioma de la pantalla: el que eligió antes, o el de su navegador
  const [lang, setLang] = useState<Lang>('es');
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('cleared-sign-lang'); } catch { /* sin almacenamiento */ }
    const q = new URLSearchParams(window.location.search).get('lang');
    const pick = (q === 'en' || q === 'es') ? q : saved === 'en' || saved === 'es' ? saved : navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
    setLang(pick as Lang);
  }, []);
  const choose = (l: Lang) => { setLang(l); try { localStorage.setItem('cleared-sign-lang', l); } catch { /* sin almacenamiento */ } };
  const t = T[lang], A = AVISOS[lang];

  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'sign' | 'change' | 'sent'>('sign');
  const [sigMode, setSigMode] = useState<'name' | 'draw'>('name');
  const [drawing, setDrawing] = useState<string | null>(null);
  // primero se acepta el aviso; luego aparecen los pasos
  const [agree, setAgree] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const avisoDl = () => start(async () => downloadBlob(await avisoPdf(view.workspace.name, lang), lang === 'es' ? 'Aviso de firma electronica.pdf' : 'Electronic signature notice.pdf'));
  const me = view.participants.find((p) => p.id === view.me)!;
  const a = view.agreement;
  const letterLang: Lang = a.language === 'es' ? 'es' : 'en';

  const model: LetterModel = {
    title: view.work.title, artist: view.work.artist || '', version: a.version, status: a.status, lang: letterLang,
    date: view.work.session_date || (a.sent_at || new Date().toISOString()).slice(0, 10), template: view.workspace.template, workspace: view.workspace.name,
    rows: view.participants.map((p) => rowFrom({ role: p.role, share_bp: p.share_bp, credits: p.credits,
      snap: { legal_name: p.legal_name, credit_name: p.credit_name, publisher: p.publisher, pro: p.pro, ipi: p.ipi },
      sig: p.signed ? { status: 'signed', signed_at: p.signed_at, typed_name: p.legal_name, signature_png: p.signature_png } : null }, letterLang)),
    hash: a.content_sha256, sentAt: a.sent_at, completedAt: a.completed_at, log: [],
  };
  const pdf = () => start(async () => downloadBlob(await letterPdf(model), `Split ${fileSafe(view.work.title)} v${a.version}.pdf`));
  const roleName = lang === 'es' ? ROLES[me.role as keyof typeof ROLES] ?? me.role : ROLE_EN[me.role] ?? me.role;
  const closed = view.my_status === 'void' || view.my_status === 'expired' || a.status === 'void';

  return (
    <div className="stack" lang={lang}>
      <section className="card glass">
        <div className="sign-top">
          <p className="eyebrow">{t.asks(view.workspace.name)}</p>
          <div className="seg lang-pick" role="group" aria-label="Idioma / Language">
            <button type="button" className="seg-b" aria-pressed={lang === 'es'} onClick={() => choose('es')}>ES</button>
            <button type="button" className="seg-b" aria-pressed={lang === 'en'} onClick={() => choose('en')}>EN</button>
          </div>
        </div>
        <h1 style={{ fontSize: '1.5rem' }}>“{view.work.title}”</h1>
        <p className="muted">{view.work.artist}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="pill info">{t.share}: {fmtPct(me.share_bp)} % · {roleName}</span>
          <span className="pill">{view.participants.filter((p) => p.signed).length}/{view.participants.length} {t.sigs}</span>
        </div>
        {letterLang !== lang && <p className="muted small" style={{ margin: '10px 0 0' }}>{letterLang === 'en' ? t.letterIn : t.letterInEs}</p>}
      </section>

      {view.my_status === 'signed' ? (
        <div className="banner info"><span>{t.signed(fmtStamp(view.signed_at, lang))} {a.status === 'signed' ? t.allSigned : t.willGet}</span>
          <button className="btn" onClick={pdf} disabled={pending}>{t.download}</button></div>
      ) : closed ? (
        <div className="banner crit"><span>{view.my_status === 'expired' ? t.expired : t.voided}</span></div>
      ) : null}

      <div className="paper-wrap"><Letter m={model} /></div>

      {!closed && view.my_status === 'pending' && mode === 'sign' && (
        <section className="card glass">
          <header><h2>{t.sign}</h2>{accepted && <button type="button" className="linkish small" onClick={() => setAviso(true)}>{t.viewNotice}</button>}</header>
          {!accepted ? (
            <div className="gate">
              <b>{t.before}</b>
              <p className="muted small">{t.read} <button type="button" className="linkish" onClick={() => setAviso(true)}>{A.title}</button>{t.readAfter}</p>
              <label className="consent">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>{t.agree}</span>
              </label>
              <div className="row spread">
                <button type="button" className="btn" onClick={() => { setErr(''); setMode('change'); }}>{t.change}</button>
                <button type="button" className="btn primary" disabled={!agree} onClick={() => setAccepted(true)}>{t.cont}</button>
              </div>
            </div>
          ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await sign(token, code, name, consent, sigMode === 'draw' ? drawing : null, lang); if (r.error) setErr(r.error); else router.refresh(); }); }}>
            <div className="code-step">
              <div>
                <b>{t.s1}</b>
                <p className="muted small">{t.s1hint(view.email_hint ?? t.yourEmail)}</p>
              </div>
              <button type="button" className="btn" disabled={pending}
                onClick={() => { setErr(''); setInfo(''); start(async () => { const r = await requestCode(token, lang); if (r.error) setErr(r.error); else { setCodeSent(true); setInfo(t.sentOk); } }); }}>
                {codeSent ? t.resend : t.send}</button>
            </div>
            {info && <p className="form-msg ok" role="status">{info}</p>}
            <label className="f">{t.s2}
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-in" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={!codeSent} />
            </label>
            <label className="f">{t.s3}
              <span className="hint">{t.s3hint(me.legal_name)}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            <div className="f">
              <span className="flabel">{t.s4}</span>
              <div className="seg" role="group" aria-label={t.s4} style={{ width: 'fit-content' }}>
                <button type="button" className="seg-b" aria-pressed={sigMode === 'name'} onClick={() => setSigMode('name')}>{t.withName}</button>
                <button type="button" className="seg-b" aria-pressed={sigMode === 'draw'} onClick={() => setSigMode('draw')}>{t.draw}</button>
              </div>
              {sigMode === 'name'
                ? <div className="sigpreview"><span className="esig">{name.trim() || me.legal_name}</span></div>
                : <SignaturePad onChange={setDrawing} hint={t.padHint} clearLabel={t.padClear} label={t.padLabel} />}
            </div>
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t.final(sigMode === 'draw')}</span>
            </label>
            {err && <p className="form-msg crit" role="alert">{err}</p>}
            <div className="row spread">
              <button type="button" className="btn" onClick={() => { setErr(''); setMode('change'); }}>{t.change}</button>
              <button className="btn primary" disabled={pending || !consent || !name.trim() || code.length !== 6 || (sigMode === 'draw' && !drawing)}>{pending ? t.signing : t.sign}</button>
            </div>
          </form>
          )}
        </section>
      )}
      {!closed && view.my_status === 'pending' && mode === 'change' && (
        <section className="card glass">
          <header><h2>{t.changeTitle}</h2></header>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await requestChange(token, note, lang); if (r.error) setErr(r.error); else setMode('sent'); }); }}>
            <label className="f">{t.what}
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.whatPh} required />
            </label>
            {err && <p className="form-msg crit" role="alert">{err}</p>}
            <div className="row spread">
              <button type="button" className="btn" onClick={() => setMode('sign')}>{t.back}</button>
              <button className="btn primary" disabled={pending}>{t.submit}</button>
            </div>
          </form>
        </section>
      )}
      {aviso && (
        <Panel title={A.title} onClose={() => setAviso(false)}>
          <div className="aviso" lang={lang}>
            <p className="muted small">{view.workspace.name} · Cleared · {A.label}</p>
            {A.sections(view.workspace.name).map((x) => <section key={x.h}><h3>{x.h}</h3><p>{x.p}</p></section>)}
            <section><h3>{A.confirmHead}</h3><ul>{A.confirm.map((c) => <li key={c}>{c}</li>)}</ul></section>
            <div className="row">
              <button type="button" className="btn" onClick={avisoDl} disabled={pending}>{t.dl}</button>
              <button type="button" className="btn" onClick={() => window.print()}>{t.print}</button>
              {!accepted && <button type="button" className="btn primary" onClick={() => { setAgree(true); setAviso(false); }}>{t.gotIt}</button>}
            </div>
          </div>
        </Panel>
      )}
      {mode === 'sent' && <div className="banner info"><span>{t.sentNote(view.workspace.name)}</span></div>}
    </div>
  );
}
