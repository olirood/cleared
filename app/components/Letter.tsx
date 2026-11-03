import { COLS, LETTER, fmtEn, type LetterModel } from '@/lib/letter';
import { fmtDateTime } from '@/lib/splits';

export default function Letter({ m }: { m: LetterModel }) {
  const total = m.rows.reduce((t, r) => t + (parseFloat(r.pct) || 0), 0);
  const state = m.status === 'signed' ? 'Signed by all parties' : m.status === 'sent' ? 'Out for signature' : m.status === 'void' ? 'Void' : 'Draft';
  return (
    <article className="paper letter">
      <header className="lhead">
        {m.template === 'apollo' ? <img className="logo" src="/apollo-logo.png" alt="Apollo Music" /> : <span className="lws">{m.workspace}</span>}
        <span className="lstate">Version {m.version} · {state}</span>
      </header>
      <h3 className="ltitle">{LETTER.title}</h3>
      <p className="ldate">{fmtEn(m.date)}</p>
      <p>{LETTER.salutation}</p>
      <p>{LETTER.intro}</p>
      <p><b>Song Title(s):</b> <b><i>“{m.title}”</i></b> of the artists or band professionally known as <b>{m.artist || '—'}</b>.</p>
      <p><b>Writers &amp; Splits:</b> {LETTER.splitsLead}</p>
      <div className="tw">
        <table className="lt">
          <thead><tr>{COLS.map((c, i) => <th key={c} className={i === COLS.length - 1 ? 'r' : undefined}>{c}</th>)}</tr></thead>
          <tbody>
            {m.rows.map((r, i) => (
              <tr key={i}>
                <td data-label={COLS[0]}><span><b>{r.name}</b>{r.artist && <span className="sub">{r.artist}</span>}{r.credits && <span className="sub">Credits: {r.credits}</span>}</span></td>
                <td data-label={COLS[1]}><span>{r.role}</span></td>
                <td data-label={COLS[2]}><span>{r.publisher}</span></td>
                <td data-label={COLS[3]}><span>{r.pro || '—'}{r.ipi && <span className="sub">IPI {r.ipi}</span>}</span></td>
                <td data-label={COLS[4]} className="r lpct"><span>{r.pct}%</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={COLS.length - 1}>Total</td><td className="r lpct">{Math.round(total * 100) / 100}%</td></tr></tfoot>
        </table>
      </div>
      <p><b>Originality of Contribution.</b> {LETTER.originality}</p>
      <p><b>Warranties &amp; Representations.</b> {LETTER.warranties}</p>
      <p>{LETTER.counterparts}</p>
      <p>{LETTER.confirm}</p>
      <p className="accepted"><b>{LETTER.accepted}</b></p>
      <div className="sigs">
        {m.rows.map((r, i) => (
          <div key={i} className="sig">
            <div className="sline">{r.signed && r.sigImage ? <img className="esig-img" src={r.sigImage} alt={`Firma de ${r.name}`} /> : r.signed && <span className="esig" style={{ ['--n' as string]: (r.typedName || r.name).length }}>{r.typedName || r.name}</span>}</div>
            <div className="sname">{r.name}</div>
            {r.signed
              ? <div className="stamp ok">Signed electronically · {fmtDateTime(r.signedAt)}</div>
              : m.status !== 'draft' && <div className="stamp">Pending signature</div>}
          </div>
        ))}
      </div>
      {m.hash && <div className="hash">SHA-256 {m.hash}</div>}
    </article>
  );
}
