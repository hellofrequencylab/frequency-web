// A small "active now" dot. Place inside a `relative` avatar wrapper. Reuses the
// shared presence window (lib/presence). Renders nothing when offline so callers
// can drop it in unconditionally. (Liveness signals — COMMS-STRATEGY §7.)
export function PresenceDot({
  online,
  className = '',
  title = 'Active now',
}: {
  online: boolean
  className?: string
  title?: string
}) {
  if (!online) return null
  return (
    <span
      title={title}
      aria-label={title}
      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface ${className}`}
    />
  )
}
