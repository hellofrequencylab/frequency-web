import React from 'react'

const TONES = {
  neutral:   { bg: 'var(--color-surface-elevated)', fg: 'var(--color-text-muted)', bd: 'var(--color-border)' },
  primary:   { bg: 'var(--color-primary-bg)', fg: 'var(--color-primary-strong)', bd: 'transparent' },
  signal:    { bg: 'var(--color-signal-bg)', fg: 'var(--color-signal-strong)', bd: 'transparent' },
  broadcast: { bg: 'var(--color-broadcast-bg)', fg: 'var(--color-broadcast-strong)', bd: 'transparent' },
  success:   { bg: 'var(--color-success-bg)', fg: 'var(--color-success)', bd: 'transparent' },
  warning:   { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)', bd: 'transparent' },
  danger:    { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)', bd: 'transparent' },
}

/**
 * Badge — a small status / category pill. Tones map to the semantic palette
 * (amber primary, teal signal, azure broadcast, plus states). `solid` fills
 * with the tone color for a louder marker. Use sparingly; one accent per row.
 */
export function Badge({ children, tone = 'neutral', solid = false, icon, className = '', style }) {
  const t = TONES[tone] || TONES.neutral
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.15rem 0.55rem',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-meta)',
    fontWeight: 700,
    lineHeight: 1.4,
    letterSpacing: '0.01em',
    border: `1px solid ${t.bd}`,
    background: solid ? t.fg : t.bg,
    color: solid ? 'var(--color-surface)' : t.fg,
    ...style,
  }
  return (
    <span className={className} style={base}>
      {icon}
      {children}
    </span>
  )
}
