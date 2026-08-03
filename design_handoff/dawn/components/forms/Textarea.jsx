import React from 'react'

/**
 * Textarea — a multi-line text field matching Input's chrome. Used by the feed
 * composer, replies, and bios. Auto-min-height via rows.
 */
export function Textarea({ label, id, invalid = false, hint, rows = 4, className = '', style, ...rest }) {
  const inputId = id || (label ? `ta-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  const field = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.7rem 0.9rem',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    lineHeight: 1.6,
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    resize: 'vertical',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
  }
  return (
    <div className={className} style={{ display: 'block', ...style }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', fontSize: 'var(--text-body-sm)', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <textarea id={inputId} rows={rows} style={field} aria-invalid={invalid || undefined} {...rest} />
      {hint && (
        <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-meta)', color: invalid ? 'var(--color-danger)' : 'var(--color-text-subtle)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
