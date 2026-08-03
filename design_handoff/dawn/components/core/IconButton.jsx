import React from 'react'

/**
 * IconButton — a compact icon-only control (reactions, kebab menus, toolbar
 * actions). Quiet by default (subtle icon, warm hover wash); `active` lights it
 * in a tone (amber primary, danger for a liked heart, etc.).
 */
export function IconButton({
  children,
  label,
  size = 36,
  tone = 'neutral',
  active = false,
  round = false,
  onClick,
  className = '',
  style,
  ...rest
}) {
  const toneColor = {
    neutral: 'var(--color-primary-strong)',
    danger: 'var(--color-danger)',
    signal: 'var(--color-signal-strong)',
    broadcast: 'var(--color-broadcast-strong)',
  }[tone] || 'var(--color-primary-strong)'
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: round ? 'var(--radius-full)' : 'var(--radius-md)',
    border: 'none',
    background: active ? 'var(--color-surface-elevated)' : 'transparent',
    color: active ? toneColor : 'var(--color-text-subtle)',
    cursor: 'pointer',
    transition: 'background 140ms ease, color 140ms ease',
    ...style,
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      style={base}
      onClick={onClick}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--color-surface-elevated)'; e.currentTarget.style.color = 'var(--color-text-muted)' } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-subtle)' } }}
      {...rest}
    >
      {children}
    </button>
  )
}
