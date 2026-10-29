// THE DONE NOTE. Shown at the top of /launch right after Publish: a ring that draws itself once, a plain sentence,
// and what just went live. Calm on purpose (no confetti): the ring uses motion tokens, so it holds still for anyone
// who asks for reduced motion. Presentational, server-friendly.

const SIZE = 72
const STROKE = 6
const R = (SIZE - STROKE) / 2
const LEN = 2 * Math.PI * R

export function PublishedNote({ who, spotlightHref, wentLive }: { who: string; spotlightHref: string | null; wentLive: readonly string[] }) {
  return (
    <section
      className="panel"
      aria-live="polite"
      style={{
        display: 'flex',
        gap: 20,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <svg
        className="lr-draw"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden
        style={{
          flex: 'none',
          color: 'var(--fq-accent)',
          ['--lr-len' as string]: LEN,
        }}
      >
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--fq-track)" strokeWidth={STROKE} />
        <circle
          className="lr-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={LEN}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <path className="lr-tick" d="M24 37.5l9 9 16-17" fill="none" stroke="currentColor" strokeWidth={STROKE - 1} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ flex: '1 1 240px', minWidth: 0, display: 'grid', gap: 6 }}>
        <div className="eyebrow">Published</div>
        <h1 className="h2">You&rsquo;re live, {who}.</h1>
        <p className="t2">
          {wentLive.length > 0 ? `${wentLive.join(' and ')} ${wentLive.length > 1 ? 'are' : 'is'} up, in your own words.` : 'Your words are saved.'} What is left below is yours to do in your own time.
        </p>
        {spotlightHref ? (
          <p>
            <a className="btn pa" href={spotlightHref} target="_blank" rel="noopener">
              See my Spotlight
            </a>
          </p>
        ) : null}
      </div>
    </section>
  )
}
