import { COLS, LETTER, fmtEn, type LetterModel } from '@/lib/letter';
import { fmtDateTime } from '@/lib/splits';

export default function Letter({ m }: { m: LetterModel }) {
  return (
    <article className="paper letter">
      {m.template === 'apollo'
        ? <img className="logo" src="/apollo-logo.png" alt="Apollo Music" />
        : <div className="lhead">{m.workspace}</div>}
      <h3 className="ltitle">{LETTER.title}</h3>
      <p><b>Date:</b> {fmtEn(m.date)}</p>
      <p>{LETTER.salutation}</p>
      <p>{LETTER.intro}</p>
      <p className="gap"><b>Song Title(s):</b> <b><i>“{m.title}”</i></b> of the artists or band professionally known as <b>{m.artist || '—'}</b>.</p>
      <p className="gap"><b>Writers &amp; Splits:</b> {LETTER.splitsLead}</p>
      <div className="tw">
        <table className="lt">
          <thead><tr>{COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {m.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td><td>{r.artist}</td><td>{r.role}</td><td className="c">{r.pct}</td><td>{r.publisher}</td>
                <td>{r.pro}{r.ipi && <><br /><span className="ipi">IPI {r.ipi}</span></>}</td><td>{r.credits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><b>Originality of Contribution</b>: {LETTER.originality}</p>
      <p><b>Warranties &amp; Representations</b>: {LETTER.warranties}</p>
      <p>{LETTER.counterparts}</p>
      <p>{LETTER.confirm}</p>
      <p className="gap"><b>{LETTER.accepted}</b></p>
      <div className="sigs">
        {m.rows.map((r, i) => (
          <div key={i} className="sig">
            <div className="sline">{r.signed && <span className="esig">{r.typedName || r.name}</span>}</div>
            <div className="sname">{r.name}</div>
            {r.signed
              ? <div className="stamp">Firmado electrónicamente · {fmtDateTime(r.signedAt)}</div>
              : m.status !== 'draft' && <div className="stamp pend">Pendiente de firma</div>}
          </div>
        ))}
      </div>
      {m.hash && <div className="hash">Huella del contenido (SHA-256): {m.hash}</div>}
      {m.status === 'signed' && (
        <div className="sealed"><span className="seal-mark">✓</span><div><b>Sealed by Cleared</b><div className="hash">Firmado por todas las partes · {fmtDateTime(m.completedAt)}</div></div></div>
      )}
    </article>
  );
}
