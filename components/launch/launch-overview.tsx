import { overviewProgress, type InventorySection } from '@/lib/launch/overview'

// THE LAUNCH OVERVIEW (the face). One page every way in lands on: what the account already has, shown as done, what is
// next, and the progress as a ring overall and a bar per section. Frequency style: tokens only, graph in inline SVG,
// words in HTML. Photos are inspiring, never pressure, with a plain Skip. Presentational; the data comes from the
// inventory.

function Ring({ ratio, size, stroke }: { ratio: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: 'block', transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fq-track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fq-accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
    </svg>
  )
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden style={{ display: 'block' }}>
      <rect x="0" y="0" width="100" height="8" rx="4" fill="var(--fq-track)" />
      <rect x="0" y="0" width={Math.max(ratio * 100, ratio > 0 ? 6 : 0)} height="8" rx="4" fill="var(--fq-accent)" />
    </svg>
  )
}

function Tick({ done }: { done: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', color: 'var(--fq-accent)' }}>
      <circle cx="11" cy="11" r="9.5" fill={done ? 'currentColor' : 'none'} stroke={done ? 'currentColor' : 'var(--fq-border-hair)'} strokeWidth="1.5" />
      {done ? <path d="M6.5 11.3l3 3 6-6.3" fill="none" stroke="var(--fq-surface-card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  )
}

export function LaunchOverview({ sections, who, nextHref, photoHref }: { sections: readonly InventorySection[]; who: string; nextHref: string; photoHref?: string }) {
  const p = overviewProgress(sections)
  const pct = Math.round(p.ratio * 100)
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section className="panel" style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 120, height: 120, flex: 'none' }}>
            <Ring ratio={p.ratio} size={120} stroke={10} />
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <span className="num" style={{ fontSize: 28, lineHeight: 1 }}>{pct}%</span>
            </div>
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 8 }}>
            <div className="eyebrow">Welcome back, {who}</div>
            <h1 className="h2">You already built a good part of this.</h1>
            <p className="t2">{p.done} of {p.total} done. We looked at everything on your account and ticked what is already there. Nothing here is made up.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {p.sections.map((s) => (
            <div key={s.id} style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{s.title}</span>
                <span className="t2">{s.done}/{s.total}</span>
              </div>
              <Bar ratio={s.ratio} />
            </div>
          ))}
        </div>
      </section>

      {p.next ? (
        <section className="panel" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Next up</div>
            <h2 className="h2">{p.next.item.label}</h2>
          </div>
          <a className="btn pa" href={nextHref}>Pick up here</a>
        </section>
      ) : null}

      {sections.map((s) => {
        const sp = p.sections.find((x) => x.id === s.id)
        return (
          <section key={s.id} className="panel" style={{ display: 'grid', gap: 12 }} aria-label={s.title}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <h2 className="h2">{s.title}</h2>
              <span className="t2">{sp?.state === 'done' ? 'All set' : `${sp?.done ?? 0} of ${sp?.total ?? 0}`}</span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {s.items.map((i) => (
                <li key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Tick done={i.state === 'done'} />
                  <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>{i.label}</span>
                    {i.found ? <span className="t2">{i.found}</span> : null}
                    {i.photo && i.state === 'todo' ? (
                      <span className="t2">{i.skipped ? 'Skipped for now. It stays here whenever you feel like it.' : 'A face or a place makes this feel like yours. You can change it any time.'}</span>
                    ) : null}
                    {i.photo && i.state === 'todo' && !i.skipped && photoHref ? (
                      <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                        <a className="btn pa" href={photoHref}>Add a photo</a>
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
