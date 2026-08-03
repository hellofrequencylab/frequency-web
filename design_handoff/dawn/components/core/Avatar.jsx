import React from 'react'

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar — a round member image with a warm initials fallback (amber-bg /
 * primary-strong text, the in-app convention). Optional teal "online now" dot.
 */
export function Avatar({ name = '', src, size = 44, online = false, className = '', style }) {
  const ring = Math.max(2, Math.round(size / 18))
  const wrap = { position: 'relative', width: size, height: size, flexShrink: 0, ...style }
  const common = {
    width: size, height: size, borderRadius: 'var(--radius-full)',
    objectFit: 'cover', display: 'block',
  }
  return (
    <span className={className} style={wrap}>
      {src ? (
        <img src={src} alt={name} style={common} />
      ) : (
        <span
          style={{
            ...common,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-primary-bg)', color: 'var(--color-primary-strong)',
            fontFamily: 'var(--font-sans)', fontWeight: 700,
            fontSize: Math.round(size * 0.38), userSelect: 'none',
          }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          aria-label="Online now"
          style={{
            position: 'absolute', bottom: -1, right: -1,
            width: size * 0.26, height: size * 0.26, borderRadius: '50%',
            background: 'var(--color-success)', boxShadow: `0 0 0 ${ring}px var(--color-surface)`,
          }}
        />
      )}
    </span>
  )
}
