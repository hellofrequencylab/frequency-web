import React from 'react'

/**
 * Switch — a toggle for instant on/off settings (notifications, presence,
 * demo content). Amber when on; pill track + sliding knob. Keyboard + ARIA.
 */
export function Switch({ checked = false, onChange, label, disabled = false, id, className = '', style }) {
  const w = 44, h = 26, pad = 3
  const knob = h - pad * 2
  const track = {
    position: 'relative',
    width: w, height: h,
    borderRadius: 'var(--radius-full)',
    background: checked ? 'var(--color-primary)' : 'var(--color-border-strong)',
    transition: 'background 160ms ease',
    flexShrink: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none', padding: 0,
    opacity: disabled ? 0.5 : 1,
  }
  const dot = {
    position: 'absolute', top: pad, left: checked ? w - knob - pad : pad,
    width: knob, height: knob, borderRadius: '50%', background: '#fff',
    boxShadow: 'var(--shadow-sm)', transition: 'left 160ms cubic-bezier(0.34,1.4,0.64,1)',
  }
  const btn = (
    <button
      type="button" role="switch" aria-checked={checked} id={id} disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)} style={track}
    >
      <span style={dot} />
    </button>
  )
  if (!label) return <span className={className} style={style}>{btn}</span>
  return (
    <label className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
      {btn}
      <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
    </label>
  )
}
