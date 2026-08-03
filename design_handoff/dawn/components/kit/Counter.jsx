import React from 'react'
import { Glyph } from '../core/Glyph.jsx'

// One glyph per counted thing, so a number is always readable at a glance.
const GLYPH = { zaps: 'zap', gems: 'gem', streak: 'flame', airtime: 'timer', amplitude: 'activity',
  members: 'users', circles: 'users-round', events: 'calendar-days', practices: 'sparkles',
  journeys: 'route', trophies: 'trophy', invites: 'user-plus', checkins: 'footprints',
  posts: 'message-circle', replies: 'message-square', rooms: 'hash' }

// Zaps and streaks are amber; Gems and anything "done" are the teal; movement is Move.
const TONE = { zaps: 'primary', streak: 'primary', gems: 'signal', trophies: 'signal',
  airtime: 'move', practices: 'move', amplitude: 'signal' }

const SIZES = {
  xs: { v: '0.9rem', i: 13, cap: 'var(--text-3xs)', gap: 4, pad: '0.2rem 0.5rem' },
  sm: { v: '1.05rem', i: 15, cap: 'var(--text-2xs)', gap: 5, pad: '0.25rem 0.6rem' },
  md: { v: '1.3rem', i: 17, cap: 'var(--text-2xs)', gap: 6, pad: '0.3rem 0.7rem' },
  lg: { v: '1.75rem', i: 20, cap: 'var(--text-meta)', gap: 8, pad: '0.4rem 0.8rem' },
}

/**
 * Counter — the one way a number appears in the member register. A glyph, a
 * tabular value, and an optional caption. Three shapes: `inline` (a run of
 * numbers in a row), `chip` (a standalone pill in chrome), `tile` (stacked, for
 * a stat triad). Never an analytics delta: that is StatCard, operator only.
 */
export function Counter({ kind = 'zaps', value, caption, icon, tone, size = 'sm', shape = 'inline',
  muted = false, title, className = '', style }) {
  const s = SIZES[size] || SIZES.sm
  const t = tone || TONE[kind] || 'primary'
  const g = icon || GLYPH[kind] || 'circle'
  const color = muted ? 'var(--color-text-muted)' : `var(--color-${t}-strong)`
  const num = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: s.v, fontWeight: 500, letterSpacing: '-0.02em',
      lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: muted ? 'var(--color-text-muted)' : 'var(--color-text)' }}>{value}</span>
  )
  const glyph = <Glyph name={g} size={s.i} style={{ color }} />

  if (shape === 'tile') {
    return (
      <div className={className} title={title} style={{ flex: 1, minWidth: 0, textAlign: 'center', ...style }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap }}>{glyph}{num}</div>
        {caption ? (
          <div className="eyebrow" style={{ fontSize: s.cap, color: 'var(--color-text-muted)', marginTop: 3 }}>{caption}</div>
        ) : null}
      </div>
    )
  }
  if (shape === 'chip') {
    return (
      <span className={className} title={title}
        style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, padding: s.pad, borderRadius: 'var(--radius-pill)',
          background: muted ? 'var(--color-surface-elevated)' : `var(--color-${t}-bg)`, ...style }}>
        {glyph}{num}
        {caption ? <span className="eyebrow" style={{ fontSize: s.cap, color: 'var(--color-text-muted)' }}>{caption}</span> : null}
      </span>
    )
  }
  return (
    <span className={className} title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, ...style }}>
      {glyph}{num}
      {caption ? <span style={{ fontSize: s.cap, color: 'var(--color-text-muted)' }}>{caption}</span> : null}
    </span>
  )
}

/**
 * CounterRow — a run of Counters with one rule: at most four, and the four are
 * the game counts (Zaps, Gems, Streak, rank). Keeps every stat strip identical.
 */
export function CounterRow({ items = [], size = 'md', shape = 'tile', divided = true, className = '', style }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: shape === 'tile' ? 6 : 14, ...style }}>
      {items.slice(0, 4).map((it, i) => (
        <React.Fragment key={it.kind || i}>
          {divided && i > 0 && shape === 'tile' ? <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border)' }} /> : null}
          <Counter {...it} size={size} shape={shape} />
        </React.Fragment>
      ))}
    </div>
  )
}
