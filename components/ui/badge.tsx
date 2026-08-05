import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared badge primitive (DAWN core/Badge). The audit found five hand-rolled status pills —
// Demo, Featured, Starter, Unclaimed, Supporter — each re-deriving its own padding, radius,
// size and colour from scratch, and already drifting (Supporter sat on px-2 while its four
// siblings sat on px-1.5). One scale here (tone × size); `className` still merges for a
// genuine one-off (a `mt-0.5` nudge on a grid card).
//
// TONE VOCABULARY is DAWN's semantic palette, not a colour picker:
//   primary   — brand amber. The ONE chrome accent. Ownership / brand marks.
//   signal    — the rare secondary TEAL. Curation and endorsement, used sparingly.
//   broadcast — azure. COMMS ONLY (dispatches, announcements). Never decorative.
//   success   — the brand teal, never a green.
//   warning / danger — states, not decoration.
//   neutral   — the default: no accent spent, a bordered surface chip.
// One accent per row: if a card already carries a primary badge, the next marker is neutral.

export type BadgeTone = 'neutral' | 'primary' | 'signal' | 'broadcast' | 'success' | 'warning' | 'danger'

/** `md` is DAWN's body pill (meta type, sentence case). `sm` is the micro card marker the
 *  browse-card badges use: 3xs, uppercase, tight tracking — small enough to sit beside a title. */
export type BadgeSize = 'sm' | 'md'

// Tinted (default) treatment: the tone's -bg wash carrying its -strong label. Border is
// transparent rather than absent so a tinted badge and a neutral badge measure identically.
const TONE: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-elevated text-muted',
  primary: 'border-transparent bg-primary-bg text-primary-strong',
  signal: 'border-transparent bg-signal-bg text-signal-strong',
  broadcast: 'border-transparent bg-broadcast-bg text-broadcast-strong',
  success: 'border-transparent bg-success-bg text-success',
  warning: 'border-transparent bg-warning-bg text-warning',
  danger: 'border-transparent bg-danger-bg text-danger',
}

// `solid` — the louder marker. Filled with the tone itself and labelled with the token minted
// for exactly that pairing (`--color-text-on-*`), so the label stays legible in every theme
// generation. Reach for it once per screen at most.
const TONE_SOLID: Record<BadgeTone, string> = {
  neutral: 'border-transparent bg-muted text-surface',
  primary: 'border-transparent bg-primary text-on-primary',
  signal: 'border-transparent bg-signal text-on-signal',
  broadcast: 'border-transparent bg-broadcast text-on-broadcast',
  success: 'border-transparent bg-success text-on-success',
  warning: 'border-transparent bg-warning text-on-warning',
  danger: 'border-transparent bg-danger text-on-danger',
}

// The primitive owns the glyph size too — that was the fifth thing every hand-rolled pill
// re-derived. An `icon` only has to say how it is PAINTED (`fill-current` for a filled star).
const SIZE: Record<BadgeSize, string> = {
  sm: 'gap-1 px-1.5 py-0.5 text-3xs uppercase tracking-wide [&>svg]:size-2.5',
  md: 'gap-1.5 px-2 py-0.5 text-meta [&>svg]:size-3',
}

// DAWN: pills take the ROLE radius (skinnable), never a literal step (dawn/tokens/spacing.css).
const BASE = 'inline-flex shrink-0 items-center rounded-pill border font-semibold'

/** The exact badge token string for a tone × size — so a surface that cannot render a `<Badge>`
 *  (a `<Link>` pill, a slot that wants the classes only) shares the SAME tokens without a
 *  hand-rolled `bg-*-bg…` class string. */
export function badgeClasses(
  tone: BadgeTone = 'neutral',
  size: BadgeSize = 'md',
  options: { solid?: boolean; className?: string } = {},
): string {
  const { solid = false, className } = options
  return cn(BASE, SIZE[size], solid ? TONE_SOLID[tone] : TONE[tone], className)
}

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children?: ReactNode
  /** Semantic tone. `success` is the brand teal, never green; `broadcast` is comms only. */
  tone?: BadgeTone
  /** `md` = DAWN's meta pill · `sm` = the uppercase micro marker on browse cards. */
  size?: BadgeSize
  /** Fill with the tone itself for a louder marker. */
  solid?: boolean
  /** Optional leading glyph. The badge sizes it; pass only how it is painted. */
  icon?: ReactNode
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  solid = false,
  icon,
  className,
  ...props
}: BadgeProps) {
  return (
    <span className={badgeClasses(tone, size, { solid, className })} {...props}>
      {icon}
      {children}
    </span>
  )
}
