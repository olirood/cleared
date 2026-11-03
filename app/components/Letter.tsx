import { LETTERS, fmtLong, fmtStamp, type LetterModel } from '@/lib/letter';

export default function Letter({ m }: { m: LetterModel }) {
  const lang = m.lang ?? 'en', T = LETTERS[lang], COLS = T.cols;
  const total = m.rows.reduce((t, r) => t + (parseFloat(r.pct) || 0), 0);
  const state = T.state[m.status] ?? T.state.draft;
  return (
    <article className="paper letter">
      <header className="lhead">
        {m.template === 'apollo' ? <img className="logo" src="/apollo-logo.png" alt="Apollo Music" /> : <span className="lws">{m.workspace}</span>}
        <span className="lstate">{T.version} {m.version} · {state}</span>
      </header>
      <h3 className="ltitle">{T.title}</h3>
      <p className="ldate">{fmtLong(m.date, lang)}</p>
      <p>{T.salutation}</p>
      <p>{T.intro}</p>
      <p><b>{T.songTitle}</b> <b><i>“{m.title}”</i></b>{T.aka}<b>{m.artist || '—'}</b>.</p>
      <p><b>{T.writers}</b> {T.splitsLead}</p>
      <div className="tw">
        <table className="lt">
          <thead><tr>{COLS.map((c, i) => <th key={c} className={i === COLS.length - 1 ? 'r' : undefined}>{c}</th>)}</tr></thead>
          <tbody>
            {m.rows.map((r, i) => (
              <tr key={i}>
                <td data-label={COLS[0]}><span><b>{r.name}</b>{r.artist && <span className="sub">{r.artist}</span>}{r.credits && <span className="sub">{T.credits}: {r.credits}</span>}</span></td>
                <td data-label={COLS[1]}><span>{r.role}</span></td>
                <td data-label={COLS[2]}><span>{r.publisher}</span></td>
                <td data-label={COLS[3]}><span>{r.pro || '—'}{r.ipi && <span className="sub">IPI {r.ipi}</span>}</span></td>
                <td data-label={COLS[4]} className="r lpct"><span>{r.pct}%</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={COLS.length - 1}>{T.total}</td><td className="r lpct">{Math.round(total * 100) / 100}%</td></tr></tfoot>
        </table>
      </div>
      <p><b>{T.originalityH}</b> {T.originality}</p>
      <p><b>{T.warrantiesH}</b> {T.warranties}</p>
      <p>{T.counterparts}</p>
      <p>{T.confirm}</p>
      <p className="accepted"><b>{T.accepted}</b></p>
      <div className="sigs">
        {m.rows.map((r, i) => (
          <div key={i} className="sig">
            <div className="sline">{r.signed && r.sigImage ? <img className="esig-img" src={r.sigImage} alt={`Firma de ${r.name}`} /> : r.signed && <span className="esig" style={{ ['--n' as string]: (r.typedName || r.name).length }}>{r.typedName || r.name}</span>}</div>
            <div className="sname">{r.name}</div>
            {r.signed
              ? <div className="stamp ok">{T.signedAt} · {fmtStamp(r.signedAt, lang)}</div>
              : m.status !== 'draft' && <div className="stamp">{T.pending}</div>}
          </div>
        ))}
      </div>
      {m.hash && <div className="hash">SHA-256 {m.hash}</div>}
    </article>
  );
}
