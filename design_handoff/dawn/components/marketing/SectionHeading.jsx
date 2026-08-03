import React from 'react'

/**
 * SectionHeading — the one marketing section header: a tracked uppercase
 * eyebrow → a heavy Anton display H2 → an optional italic kicker (the deck).
 * Every page heading routes through this. Eyebrow tracking is locked at 0.25em.
 */
export function SectionHeading({
  eyebrow,
  title,
  kicker,
  tone = 'light',
  align = 'left',
  size = 'default',
  className = '',
  style,
}) {
  const isInk = tone === 'ink'
  const h2Size = size === 'sm' ? 'var(--text-display-h3)' : 'var(--text-display-h2)'
  return (
    <div className={className} style={{ textAlign: align, marginBottom: '2.25rem', ...style }}>
      {eyebrow && (
        <p className="eyebrow" style={{ margin: '0 0 1rem', color: isInk ? 'var(--color-primary)' : 'var(--color-primary-strong)' }}>
          {eyebrow}
        </p>
      )}
      <h2 className="font-display" style={{ margin: 0, fontSize: h2Size, color: isInk ? 'var(--color-on-ink)' : 'var(--color-text)' }}>
        {title}
      </h2>
      {kicker && (
        <p className="kicker" style={{ margin: '1rem 0 0', color: isInk ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)' }}>
          {kicker}
        </p>
      )}
    </div>
  )
}
