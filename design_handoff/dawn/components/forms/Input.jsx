import React from 'react'

/**
 * Input — a single-line text field. Hairline warm border, generous height,
 * calm neutral focus ring (text fields never glow amber). Optional leading icon
 * and label. Set `invalid` for the danger border.
 */
export function Input({
  label,
  id,
  icon,
  invalid = false,
  hint,
  type = 'text',
  className = '',
  style,
  ...rest
}) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  const field = {
    width: '100%',
    boxSizing: 'border-box',
    height: '2.75rem',
    padding: icon ? '0 0.9rem 0 2.4rem' : '0 0.9rem',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
  }
  return (
    <div className={className} style={{ display: 'block', ...style }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', fontSize: 'var(--text-body-sm)', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-subtle)', display: 'inline-flex' }}>
            {icon}
          </span>
        )}
        <input id={inputId} type={type} style={field} aria-invalid={invalid || undefined} {...rest} />
      </div>
      {hint && (
        <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-meta)', color: invalid ? 'var(--color-danger)' : 'var(--color-text-subtle)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
