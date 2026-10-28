import type { ClockView } from '@/lib/launch/clock'

// THE LAUNCH CLOCK (the face). The twelve minute game, drawn: a ring that fills as the time is used, the time in the
// display face, a line that cheers the pace on (never one that scolds), and a pip for each stage with the next one
// named. Presentational and server-friendly: the live tick and the heartbeat are a client wrapper around it.

const CHEER: Readonly<Record<ClockView['pace'], string>> = {
  start: 'Your clock starts when you do.',
  ahead: 'Ahead of the clock.',
  on: 'Right on pace.',
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

/** variant "pill": a slim bar that stays with the page. variant "hero": a card with a big ring. */
export function LaunchClock({ view, stages, done, variant }: { view: ClockView; stages: readonly string[]; done: number; variant: 'pill' | 'hero' }) {
  const next = stages[done]
  const state = view.running ? 'On the clock' : 'Paused'
  if (variant === 'pill') {
    return (
      <div role="timer" aria-label={`${view.label} ${view.bonus ? 'of bonus time' : 'left'}`} style={{ position: 'sticky', top: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px 8px 10px', borderRadius: 999, border: '1px solid var(--fq-border-hair)', background: 'var(--fq-surface-card)', boxShadow: 'var(--fq-shadow-1)' }}>
        <div style={{ position: 'relative', width: 44, height: 44, flex: 'none' }}>
          <Ring used={view.used} size={44} stroke={5} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 22, lineHeight: 1 }}>{view.label}</span>
            <span className="t2">{view.bonus ? 'bonus time' : 'left'} · {state}</span>
          </div>
          <div className="t2" style={{ marginTop: 2 }}>{CHEER[view.pace]}</div>
        </div>
        <Pips labels={stages} done={done} />
      </div>
    )
  }
  return (
    <section role="timer" aria-label={`${view.label} ${view.bonus ? 'of bonus time' : 'left'}`} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 132, height: 132, flex: 'none' }}>
        <Ring used={view.used} size={132} stroke={10} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="num" style={{ fontSize: 30, lineHeight: 1 }}>{view.label}</div>
            <div className="t2" style={{ marginTop: 4 }}>{view.bonus ? 'bonus time' : 'left'}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 10 }}>
        <div className="eyebrow">{state}</div>
        <h2 className="h2">{CHEER[view.pace]}</h2>
        <Pips labels={stages} done={done} />
        <p className="t2">{next ? `Next up: ${next}. Finish this one and it opens.` : 'Every stage is done. Take a breath, you launched.'}</p>
      </div>
    </section>
  )
}
