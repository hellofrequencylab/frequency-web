import React from 'react'

/**
 * Checkbox — a custom warm checkbox. Amber fill + check when on. Used for the
 * beta "Oath" gate, settings, and filters. Supports an optional rich label.
 */
export function Checkbox({ checked = false, onChange, label, disabled = false, id, className = '', style }) {
  const box = {
    width: 22, height: 22, flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
    background: checked ? 'var(--color-primary)' : 'var(--color-surface)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 140ms ease, border-color 140ms ease',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
  return (
    <label className={className} style={{ display: 'inline-flex', alignItems: label ? 'flex-start' : 'center', gap: '0.6rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, ...style }}>
      <button
        type="button" role="checkbox" aria-checked={checked} id={id} disabled={disabled}
        onClick={() => !disabled && onChange && onChange(!checked)} style={box}
      >
        {checked && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      {label && <span style={{ fontSize: 'var(--text-body-sm)', lineHeight: 1.5, color: 'var(--color-text)' }}>{label}</span>}
    </label>
  )
}
