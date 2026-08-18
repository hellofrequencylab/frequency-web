'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'

// Toast — THE transient notice (DAWN feedback/Toast). One shell, one entrance, one
// timer, for every "the thing you just did worked" moment: a Quest award, "+15 Zaps",
// a save confirmation.
//
// WHY THIS EXISTS. The product shipped TWO toast renderers — components/achievement-toast.tsx
// and components/zap-toast.tsx — which shared nothing but the lane they render into
// (components/toast-lane.tsx). Between them they had two card shells, two elevation
// vocabularies (`shadow-xl` vs `.lift-3`), two radii spelled the same way by accident,
// two copies of the slide-up entrance, two copies of the setTimeout dismissal, and
// neither announced itself to a screen reader. Whichever one you read, the other one was
// the counter-example. This is the one shell they both compose now; each keeps its own
// content, its own tint and its own timing, which is all that was ever different.
//
// Presentational apart from the dismissal timer, which is the one behaviour a toast
// cannot delegate. Client-only by nature — a toast is never server-rendered.
//
//   <Toast title="+15 Zaps" icon={<Zap className="h-5 w-5" />} duration={4000}
//          onDismiss={close}>Verified practice</Toast>

/** Tints the frame border and the icon chip. `primary` (amber) is the house default.
 *  These are DAWN's four Toast tones plus `neutral`, and every name is already
 *  ProgressTrack's and Counter's — one word means one colour across the whole kit, so a
 *  broadcast is the same teal on a bar and on a toast. Chip ink takes the `-strong` step
 *  where the palette has one, because the chip wash is the light `-bg`. */
export type ToastTone = 'primary' | 'success' | 'signal' | 'broadcast' | 'danger' | 'neutral'

const TONE: Record<ToastTone, { frame: string; chip: string }> = {
  primary: { frame: 'border-primary-bg bg-surface', chip: 'bg-primary-bg text-primary-strong' },
  success: { frame: 'border-success/30 bg-surface', chip: 'bg-success-bg text-success' },
  signal: { frame: 'border-signal/30 bg-surface', chip: 'bg-signal-bg text-signal-strong' },
  broadcast: {
    frame: 'border-broadcast/30 bg-surface',
    chip: 'bg-broadcast-bg text-broadcast-strong',
  },
  danger: { frame: 'border-danger/30 bg-surface', chip: 'bg-danger-bg text-danger' },
  neutral: { frame: 'border-border bg-surface', chip: 'bg-surface-elevated text-muted' },
}

/** The ONE escape from `tone`: a toast whose colour comes from a RECORD rather than from
 *  the kit's tone vocabulary. Exactly one thing needs it — an achievement is tinted by its
 *  tier (bronze/silver/gold/platinum), which is data, and `TIER_CONFIG` in lib/gamification.ts
 *  already emits precisely this shape off the rank spectrum. A tone enum cannot absorb a
 *  value that comes out of the database, and inventing four more tone names to shadow four
 *  tier names would be two sources for one colour. Every class here is token-backed. */
export interface ToastSkin {
  /** Surface wash — translucent by construction, so the frame blurs what is behind it. */
  surface: string
  border: string
  /** Glyph colour inside the chip. */
  ink: string
  /** Optional extra ring for the loud tiers. */
  glow?: string
}

const CHIP_SIZE = { sm: 'h-9 w-9', lg: 'h-12 w-12' } as const

export function Toast({
  title,
  children,
  icon,
  eyebrow,
  footer,
  tone = 'primary',
  skin,
  size = 'sm',
  onDismiss,
  dismissible = false,
  duration = 5000,
  className = '',
}: {
  /** The headline. One short line — what happened. */
  title: ReactNode
  /** The optional second line: the detail, one step quieter. */
  children?: ReactNode
  /** The glyph node shown in the tinted chip (e.g. `<Zap className="h-5 w-5" />`).
   *  A node rather than a component so a caller keeps its own stroke weight. */
  icon?: ReactNode
  /** Small uppercase label above the title ("Achievement Unlocked"). */
  eyebrow?: ReactNode
  /** Trailing row under the body — chips, a reward line. Laid out for you. */
  footer?: ReactNode
  tone?: ToastTone
  /** Overrides `tone` when the colour is data, not a kind. See ToastSkin. */
  skin?: ToastSkin
  /** Chip scale: `sm` for a one-line notice, `lg` for a card with an eyebrow and a footer. */
  size?: keyof typeof CHIP_SIZE
  /** Called on auto-dismiss and by the dismiss control. */
  onDismiss?: () => void
  /** Show the dismiss control. Off by default: a toast that leaves on its own does not
   *  need a button, and a lane full of X's reads as a task list. */
  dismissible?: boolean
  /** Auto-dismiss delay in ms. `0` pins the toast open (it then needs `dismissible`). */
  duration?: number
  /** Layout-only additions from the caller (a fixed width, say). Never colour. */
  className?: string
}) {
  // THE ONE TIMER. Both renderers had their own copy of this effect, with the same
  // cleanup and different delays; the delay was the only real difference, so it is the
  // only thing that stayed a prop.
  useEffect(() => {
    if (!onDismiss || duration <= 0) return
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [onDismiss, duration])

  const frame = skin
    ? `${skin.border} ${skin.surface} ${skin.glow ?? ''} backdrop-blur-sm`
    : TONE[tone].frame
  const chip = skin ? `${skin.surface} ${skin.ink} ring-2 ${skin.border}` : TONE[tone].chip

  return (
    // `role="status"` is new to both: a member using a screen reader was previously awarded
    // Zaps in total silence. Polite by default, which is right — a toast reports, it does
    // not interrupt. `pointer-events-auto` re-arms the click surface the lane turns off.
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-card border px-4 py-3 lift-3 animate-[slideUp_0.4s_ease-out] ${frame} ${className}`}
    >
      {icon && (
        <span
          className={`flex shrink-0 items-center justify-center rounded-control ${CHIP_SIZE[size]} ${chip}`}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="eyebrow text-muted">{eyebrow}</p>
        )}
        <p className="text-body-sm font-bold text-text">{title}</p>
        {children && <p className="mt-0.5 text-meta leading-relaxed text-muted">{children}</p>}
        {footer && <div className="mt-2 flex items-center gap-2">{footer}</div>}
      </div>
      {dismissible && onDismiss && (
        <IconButton label="Dismiss" onClick={onDismiss} className="-mr-2 -mt-1 shrink-0">
          <X className="h-3.5 w-3.5" aria-hidden />
        </IconButton>
      )}
    </div>
  )
}
