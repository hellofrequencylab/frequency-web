import React from 'react'

/**
 * Meter — an allowance against a cap. The paywall is caps and take-rate, never
 * feature locks, so a Space never shows a lock: it shows how much room is left.
 * Warns at 80% and reads "full" at the cap, in plain language, never in red
 * alarm until the cap is actually reached.
 */
export function Meter({ label, used = 0, cap, unit, period, hint, size = 'md', className = '', style }) {
  const unlimited = cap == null
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / cap) * 100))
  const state = unlimited ? 'open' : pct >= 100 ? 'full' : pct >= 80 ? 'near' : 'ok'
  const tone = state === 'full' ? 'var(--color-danger)' : state === 'near' ? 'var(--color-warning)' : 'var(--color-signal)'
  const h = size === 'sm' ? 5 : 7
  return (
    <div className={className} style={style}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
        <span style={{ fontSize: size === 'sm' ? 'var(--text-meta)' : '0.92rem', fontWeight: 600, letterSpacing: 'var(--tracking-tight)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {used.toLocaleString()}{unlimited ? '' : ` / ${cap.toLocaleString()}`}{unit ? ` ${unit}` : ''}{period ? ` ${period}` : ''}
        </span>
      </div>
      <div style={{ height: h, borderRadius: 'var(--radius-pill)', background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ width: unlimited ? '100%' : `${pct}%`, height: '100%', borderRadius: 'var(--radius-pill)',
          background: unlimited ? `repeating-linear-gradient(90deg, var(--color-signal-bg) 0 6px, var(--color-surface-elevated) 6px 12px)` : tone,
          transition: 'width var(--motion-slow) var(--ease-out)' }} />
      </div>
      {hint || state !== 'ok' ? (
        <p style={{ margin: '5px 0 0', fontSize: 'var(--text-meta)', color: state === 'ok' || state === 'open' ? 'var(--color-text-subtle)' : tone, lineHeight: 1.5 }}>
          {hint || (state === 'full' ? 'That is the cap for this plan. Nothing is deleted, and new ones wait.' : 'Getting close to the cap.')}
        </p>
      ) : null}
    </div>
  )
}
