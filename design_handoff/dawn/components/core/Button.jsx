import React from 'react'

/**
 * Button — the one Frequency action. Amber `primary` is the only filled chrome
 * accent; `secondary` is the quiet outline; `ghost` is an inline text link.
 * Renders an <a> when `href` is given (most marketing CTAs are navigations),
 * otherwise a <button>. Embossed label on the primary fill.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  type = 'button',
  disabled = false,
  iconRight,
  iconLeft,
  onClick,
  className = '',
  style,
  ...rest
}) {
  const sizes = {
    sm: { padding: '0.55rem 1.1rem', fontSize: '0.875rem', gap: '0.4rem' },
    md: { padding: '0.8rem 2rem', fontSize: '1rem', gap: '0.5rem' },
    lg: { padding: '1rem 2.5rem', fontSize: '1.125rem', gap: '0.5rem' },
  }
  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)',
      boxShadow: 'var(--shadow-pop)',
      border: '1px solid transparent',
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary-strong)',
      border: '1px solid transparent',
      boxShadow: 'none',
    },
  }
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans)',
    fontWeight: 700,
    lineHeight: 1.1,
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    textDecoration: 'none',
    transition: 'background 160ms ease, box-shadow 160ms ease, border-color 160ms ease, transform 90ms ease',
    whiteSpace: 'nowrap',
    ...sizes[size],
    ...variants[variant],
    ...style,
  }
  const labelClass = variant === 'primary' ? 'text-emboss' : ''
  const content = (
    <>
      {iconLeft}
      <span className={labelClass}>{children}</span>
      {iconRight}
    </>
  )
  if (href && !disabled) {
    return (
      <a href={href} className={className} style={base} onClick={onClick} {...rest}>
        {content}
      </a>
    )
  }
  return (
    <button type={type} className={className} style={base} disabled={disabled} onClick={onClick} {...rest}>
      {content}
    </button>
  )
}
