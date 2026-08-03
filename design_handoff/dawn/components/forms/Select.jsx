import React from 'react'

/**
 * Select — a styled native dropdown (toolbar filters, settings). Matches Input
 * chrome with a warm chevron. Pass `options` as strings or {value,label}.
 */
export function Select({ label, id, options = [], invalid = false, hint, className = '', style, ...rest }) {
  const inputId = id || (label ? `sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  const field = {
    width: '100%', boxSizing: 'border-box', height: '2.75rem',
    padding: '0 2.4rem 0 0.9rem',
    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', fontWeight: 600,
    color: 'var(--color-text)', background: 'var(--color-surface)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
    borderRadius: 'var(--radius-md)', outline: 'none', cursor: 'pointer',
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  }
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <div className={className} style={{ display: 'block', ...style }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', fontSize: 'var(--text-body-sm)', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select id={inputId} style={field} aria-invalid={invalid || undefined} {...rest}>
          {norm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-subtle)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {hint && <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)' }}>{hint}</p>}
    </div>
  )
}
