import React from 'react'

/**
 * Card — the one Frequency surface card. A card means a *distinct object*; for
 * lists, group with a title + whitespace instead. `soft` is a borderless tinted
 * surface; `feature` is a hairline box; `elevated` adds the marketing pop
 * shadow. Radius is `xl` (in-app) by default, `2xl` for marketing feature media.
 */
export function Card({
  children,
  tone = 'feature',
  radius = 'xl',
  padding = '1.5rem',
  hover = false,
  className = '',
  style,
  ...rest
}) {
  const tones = {
    soft: { background: 'color-mix(in srgb, var(--color-surface-elevated) 60%, transparent)', border: '1px solid transparent', boxShadow: 'none' },
    feature: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' },
    elevated: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-pop)' },
  }
  const radii = { lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)' }
  const base = {
    borderRadius: radii[radius] || radii.xl,
    padding,
    transition: 'box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease',
    ...tones[tone],
    ...style,
  }
  const hoverProps = hover
    ? {
        onMouseEnter: (e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-md)'
          e.currentTarget.style.borderColor = 'var(--color-primary-bg)'
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.boxShadow = tones[tone].boxShadow
          e.currentTarget.style.borderColor = tone === 'soft' ? 'transparent' : 'var(--color-border)'
        },
      }
    : {}
  return (
    <div className={className} style={base} {...hoverProps} {...rest}>
      {children}
    </div>
  )
}
