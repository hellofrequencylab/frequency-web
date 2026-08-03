import React from 'react'

/**
 * ProgressTrack — the honest progress read. Either a continuous bar or discrete
 * steps (a Journey's four weeks, a season's three Journeys). Never a percentage
 * for its own sake: the label says what the number means.
 */
export function ProgressTrack({ label, hint, value = 0, total = 100, steps, accent = 'primary', size = 'md', className = '', style }) {
  const tone = `var(--color-${accent})`
  const h = size === 'sm' ? 6 : size === 'lg' ? 12 : 8
  const pct = total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0
  return (
    <div className={className} style={style}>
      {(label || hint) ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          {label ? <span style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: 'var(--tracking-tight)' }}>{label}</span> : null}
          {hint ? <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{hint}</span> : null}
        </div>
      ) : null}
      {steps ? (
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: steps }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: h, borderRadius: 'var(--radius-pill)',
              background: i < value ? tone : 'var(--color-surface-elevated)',
              border: i < value ? 'none' : '1px solid var(--color-border)', boxSizing: 'border-box' }} />
          ))}
        </div>
      ) : (
        <div style={{ height: h, borderRadius: 'var(--radius-pill)', background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 'var(--radius-pill)', transition: 'width var(--motion-slow) var(--ease-out)' }} />
        </div>
      )}
    </div>
  )
}
