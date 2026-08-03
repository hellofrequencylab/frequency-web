import React from 'react'
import { Glyph } from '../core/Glyph.jsx'

/**
 * StreakMeter — the streak, told honestly. The count, the earned freezes, and the
 * last seven days as dots (logged / frozen / missed / today). No shame states: a
 * miss is a hollow dot, never red, and "never miss twice" is the only nudge.
 */
export function StreakMeter({ days = 0, freezes = 0, week = [], best, size = 'md', showWeek = true,
  hint, className = '', style }) {
  const big = size === 'lg'
  const dot = (state, i) => {
    const base = { width: big ? 12 : 9, height: big ? 12 : 9, borderRadius: '50%', flexShrink: 0 }
    if (state === 'logged') return <span key={i} style={{ ...base, background: 'var(--color-primary)' }} />
    if (state === 'frozen') return <span key={i} style={{ ...base, background: 'var(--color-signal-bg)', border: '1.5px solid var(--color-signal)' }} />
    if (state === 'today') return <span key={i} style={{ ...base, background: 'transparent', border: '1.5px dashed var(--color-primary)' }} />
    return <span key={i} style={{ ...base, background: 'transparent', border: '1.5px solid var(--color-border-strong)' }} />
  }
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: big ? 16 : 12, ...style }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: big ? 8 : 6, flexShrink: 0 }}>
        <span style={{ width: big ? 40 : 30, height: big ? 40 : 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'var(--color-primary-bg)', color: 'var(--color-primary-strong)' }}>
          <Glyph name="flame" size={big ? 20 : 16} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: big ? '1.5rem' : '1.15rem', fontWeight: 500,
            letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{days}</span>
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>day{days === 1 ? '' : 's'}</span>
        </span>
      </span>
      {freezes > 0 ? (
        <span title={`${freezes} streak freeze${freezes === 1 ? '' : 's'} earned`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
            background: 'var(--color-signal-bg)', color: 'var(--color-signal-strong)', fontSize: 'var(--text-2xs)', fontWeight: 700, flexShrink: 0 }}>
          <Glyph name="snowflake" size={12} />{freezes}
        </span>
      ) : null}
      {showWeek && week.length ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: big ? 6 : 5 }}>{week.map(dot)}</span>
      ) : null}
      {hint ? <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', minWidth: 0 }}>{hint}</span> : null}
      {best != null ? (
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)', flexShrink: 0 }}>Best {best}</span>
      ) : null}
    </div>
  )
}
