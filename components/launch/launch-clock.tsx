import type { ClockView } from '@/lib/launch/clock'

// THE LAUNCH CLOCK (the face). The twelve minute game, drawn: a ring that fills as the time is used, the time in the
// display face, a line that cheers the pace on (never one that scolds), and a pip for each stage with the next one
// named. Presentational: the live tick, the heartbeat and the hero-to-pill swap are the client wrapper around it
// (launch-clock-live.tsx). Tokens only.

const CHEER: Readonly<Record<ClockView['pace'], string>> = {
  start: 'Your clock starts when you do.',
  ahead: 'Ahead of the clock.',
  on: 'Right on pace. Keep going.',
  bonus: 'Bonus time. Keep going, you are close.',
}

function Ring({ used, size, stroke }: { used: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: 'block', transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fq-track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fq-accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - used)} />
    </svg>
  )
}

function Pips({ labels, done }: { labels: readonly string[]; done: number }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 6 }} aria-label="Stages">
      {labels.map((l, i) => (
        <li key={l} title={l} style={{ width: 10, height: 10, borderRadius: 999, background: i < done ? 'var(--fq-accent)' : 'var(--fq-track)', outline: i === done ? '2px solid var(--fq-accent)' : undefined, outlineOffset: 2 }} />
      ))}
    </ol>
  )
}

/** variant "pill": a slim bar that rides with the page once the hero has scrolled away. variant "hero": a card with a
 *  big ring, at the top of the page. */
export function LaunchClock({ view, stages, done, variant }: { view: ClockView; stages: readonly string[]; done: number; variant: 'pill' | 'hero' }) {
  const next = stages[done]
  const state = view.running ? 'On the clock' : 'Paused'
  const unit = view.bonus ? 'bonus time' : 'left'
  if (variant === 'pill') {
    return (
      <div role="timer" aria-label={`${view.label} ${unit}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px 8px 10px', borderRadius: 999, border: '1px solid var(--fq-border-hair)', background: 'var(--fq-surface-card)', boxShadow: 'var(--fq-shadow-1)' }}>
        <div style={{ flex: 'none', width: 44, height: 44 }}>
          <Ring used={view.used} size={44} stroke={5} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="num text-stat-sm">{view.label}</span>
            <span className="t2">{unit} · {state}</span>
          </div>
          <div className="t2" style={{ marginTop: 2 }}>{view.running ? CHEER[view.pace] : 'Your time is saved.'}</div>
        </div>
        <Pips labels={stages} done={done} />
      </div>
    )
  }
  return (
    <section role="timer" aria-label={`${view.label} ${unit}`} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 132, height: 132, flex: 'none' }}>
        <Ring used={view.used} size={132} stroke={10} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="num text-stat-sm">{view.label}</div>
            <div className="t2" style={{ marginTop: 4 }}>{unit}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 10 }}>
        <div className="eyebrow">{state}</div>
        <h2 className="h2">{view.running ? CHEER[view.pace] : 'Paused. Your time is saved, pick up whenever you are back.'}</h2>
        <Pips labels={stages} done={done} />
        <p className="t2">{next ? `Next up: ${next}. Finish this one and it opens.` : 'Every stage is done. Take a breath, you launched.'}</p>
      </div>
    </section>
  )
}
