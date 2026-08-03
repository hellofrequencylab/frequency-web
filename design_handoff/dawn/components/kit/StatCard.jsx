import React from 'react'
import { Glyph } from '../core/Glyph.jsx'

/**
 * StatCard — the OPERATOR register's number tile. Label, value, an optional
 * delta and sparkline. Deltas and KPI walls belong here and never on a primary
 * member page (the gamified-stat law): a member's numbers are the playful
 * glyph+tile of Stat, not an analytics read.
 */
export function StatCard({ label, value, unit, delta, direction, hint, spark, className = '', style }) {
  const up = direction === 'up'
  const flat = !direction || direction === 'flat'
  const deltaColor = flat ? 'var(--color-text-muted)' : up ? 'var(--color-success)' : 'var(--color-danger)'
  const max = spark && spark.length ? Math.max(...spark) : 0
  return (
    <div className={className}
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)',
        padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <div className="eyebrow" style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</span>
        {unit ? <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)' }}>{unit}</span> : null}
        {delta != null ? (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--text-meta)', fontWeight: 700, color: deltaColor }}>
            <Glyph name={flat ? 'minus' : up ? 'trending-up' : 'trending-down'} size={13} />{delta}
          </span>
        ) : null}
      </div>
      {spark && spark.length ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26, marginTop: 2 }}>
          {spark.map((v, i) => (
            <span key={i} style={{ flex: 1, height: `${max ? (v / max) * 100 : 0}%`, borderRadius: 2,
              background: i === spark.length - 1 ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 32%, var(--color-surface-elevated))' }} />
          ))}
        </div>
      ) : null}
      {hint ? <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)' }}>{hint}</div> : null}
    </div>
  )
}
