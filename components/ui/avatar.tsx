import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import { avatarSrc, readAvatarFocus } from '@/lib/images/avatar-focus'
import { PresenceDot } from '@/components/presence/presence-dot'

// Avatar — THE round member/entity image (DAWN core/Avatar): a photo when there is one,
// a warm initials disc when there is not, and an optional "active now" dot.
//
// WHY THIS EXISTS. The product had two avatars that were the same component with different
// numbers hard-coded into them — components/profile/profile-avatar.tsx (big, ringed, on the
// profile title band) and components/connections/pulse-avatar.tsx (small, linked, in a pulse
// row) — and a third file, components/presence/presence-dot.tsx, that neither of them knew
// about. So the one surface that had presence to show (the messages roster) hand-rolled its
// own `relative` wrapper, and the two avatars could not show presence at all. One component
// with a size scale and an `online` prop is all three.
//
// Presentational + server-friendly (no hooks), so it renders from a Server Component.
//
//   <Avatar src={url} name="Maya Ortiz" size="xl" ring />
//   <Avatar src={null} name="Leo Park" size="sm" online={isOnline} />

/** The size scale, by the surface each step was measured from. Every step carries its own
 *  presence-dot diameter, because a 10px dot on a 24px avatar is a badge, not a hint. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// `px` is the intrinsic size handed to next/image, not the painted box — the two small
// steps ship the values their call sites already requested, so no surface starts asking
// the optimizer for a different asset than it did before.
const SIZE: Record<AvatarSize, { box: string; text: string; px: number }> = {
  /** Inline in a sentence or a dense chip row. */
  xs: { box: 'h-6 w-6', text: 'text-3xs', px: 48 },
  /** The pulse row and every compact list — the PulseAvatar size. */
  sm: { box: 'h-9 w-9', text: 'text-2xs', px: 36 },
  /** A card's leading slot. */
  md: { box: 'h-12 w-12', text: 'text-body-sm', px: 96 },
  /** A header row. */
  lg: { box: 'h-16 w-16', text: 'text-lead', px: 128 },
  /** The profile title band — the one responsive step, because it steps up at `sm:` the way
   *  the band it sits on does. The ProfileAvatar size. */
  xl: { box: 'h-16 w-16 sm:h-20 sm:w-20', text: 'text-page-title', px: 112 },
}

export function Avatar({
  src,
  name,
  initials,
  size = 'sm',
  online,
  focus,
  dimmed = false,
  ring = false,
  className = '',
}: {
  /** Photo or logo URL, focal fragment and all. `null` falls back to initials. */
  src: string | null | undefined
  /** Display name. Alt text, and the source of the initials unless one is passed. */
  name: string
  /** Overrides the derived initials (an entity space whose mark is not its name's letters). */
  initials?: string
  size?: AvatarSize
  /** Presence. OMIT it entirely for a surface with no presence to show — the wrapper that
   *  anchors the dot is only rendered when presence is in play, so an avatar that never
   *  shows a dot stays a single element and no existing layout moves. Passing `false`
   *  keeps the wrapper, so the dot can come and go without reflowing the row. */
  online?: boolean
  /** Explicit focal point ("x% y%"), overriding the one carried in the URL fragment
   *  (ADR-829). Pass it when you already loaded `profiles.meta.avatarFocal`. */
  focus?: string | null
  /** Demo profiles desaturate so they read as not-quite-real. */
  dimmed?: boolean
  /** The `ring-4 ring-surface` halo that lifts an avatar off a cover photo. */
  ring?: boolean
  /** Layout-only additions from the caller. Never colour. */
  className?: string
}) {
  const s = SIZE[size]
  // The focal-point system is not optional: `avatarSrc` strips the `#fp=` fragment before it
  // reaches next/image, and the object-position is what keeps a face in the round crop.
  const resolvedFocus = focus ?? readAvatarFocus(src)
  const halo = ring ? 'ring-4 ring-surface' : ''
  // `className` lands on the OUTERMOST element, so a caller's margin means the same thing
  // whether or not this avatar happens to be showing presence.
  const own = online === undefined ? className : ''

  const face = src ? (
    <Image
      src={avatarSrc(src)}
      alt={name}
      width={s.px}
      height={s.px}
      style={resolvedFocus ? { objectPosition: resolvedFocus } : undefined}
      className={`${s.box} shrink-0 rounded-pill object-cover ${halo} ${dimmed ? 'dimmed' : ''} ${own}`}
    />
  ) : (
    <span
      className={`${s.box} ${s.text} flex shrink-0 select-none items-center justify-center rounded-pill bg-primary-bg font-semibold text-primary-strong ${halo} ${own}`}
    >
      {initials ?? getInitials(name)}
    </span>
  )

  if (online === undefined) return face

  return (
    <span className={`relative inline-flex shrink-0 ${s.box} ${className}`}>
      {face}
      <PresenceDot online={online} size={size} />
    </span>
  )
}
