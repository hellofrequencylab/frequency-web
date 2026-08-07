// A small "active now" dot. Place inside a `relative` wrapper — or better, let
// `components/ui/avatar.tsx` place it for you, which is the wrapper it was missing.
// Reuses the shared presence window (lib/presence). Renders nothing when offline so
// callers can drop it in unconditionally. (Liveness signals — COMMS-STRATEGY §7.)
//
// The diameter is a NAMED step rather than a className the caller pastes in, because
// `cn()` is a plain join with no conflict resolution: an `h-4 w-4` handed in alongside a
// hard-coded `h-2.5 w-2.5` would leave the winner to CSS source order. One size class is
// emitted, ever. The scale keys match `AvatarSize` exactly so an avatar can forward its
// own size straight through, and `sm` is the historical default (byte-identical to what
// the messages roster and the DM header shipped with).

export type PresenceDotSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const DOT: Record<PresenceDotSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-4 w-4',
}

export function PresenceDot({
  online,
  size = 'sm',
  className = '',
  title = 'Active now',
}: {
  online: boolean
  size?: PresenceDotSize
  className?: string
  title?: string
}) {
  if (!online) return null
  return (
    <span
      title={title}
      aria-label={title}
      className={`absolute bottom-0 right-0 rounded-pill bg-success ring-2 ring-surface ${DOT[size]} ${className}`}
    />
  )
}
