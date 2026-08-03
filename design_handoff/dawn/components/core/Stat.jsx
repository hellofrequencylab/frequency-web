import React from 'react'

/**
 * Stat — a big display numeral over an uppercase label, the editorial way
 * Frequency shows counts (members, events, circles). Anton numeral; `ink` tone
 * for use inside a dark band. Group three in a row for a stat strip.
 */
export function Stat({ value, label, tone = 'light', className = '', style }) {
  const isInk = tone === 'ink'
  return (
    <div className={className} style={{ ...style }}>
      <div
        className="font-display"
        style={{
          fontSize: 'var(--text-stat)',
          color: isInk ? 'var(--color-on-ink)' : 'var(--color-text)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: 'var(--text-meta)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: isInk ? 'var(--color-on-ink-subtle)' : 'var(--color-text-subtle)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
