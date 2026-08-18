import { Flame, Star, Gem, Crown, Zap } from 'lucide-react'
import { resolveBorder, resolveFlair, resolveTitle } from '@/lib/store/cosmetics'

// THE COSMETIC RENDER (backlog LIVE-013). What a member bought, finally visible.
//
// Until this file existed, the three cosmetic columns on `profiles` had exactly one reader in the
// whole product: a chip in the buyer's own Vault that printed the raw stored string. Everything
// the store's copy promised ("a glowing indigo border around your avatar", "a flame icon next to
// your name") was true of nothing. These three components are that promise, kept.
//
// Presentational + server-friendly (no hooks), because the profile band renders on the server.
// Colour comes from the DAWN rank spectrum via `lib/store/cosmetics` — the stored value is DATA
// (`ring-indigo-500`, a class from a palette we do not ship), the token it paints is ours.

const FLAIR_ICONS: Record<string, React.ElementType> = {
  flame: Flame,
  star: Star,
  gem: Gem,
  crown: Crown,
  zap: Zap,
}

/** The conic sweep behind a painted border. Built from the rank-spectrum CSS variables rather
 *  than literals, so it re-tints with the skin and carries no hardcoded colour. */
const SWEEP: Record<string, string> = {
  gradient:
    'conic-gradient(from 180deg, var(--rank-clay), var(--rank-gold), var(--rank-olive), var(--rank-jade), var(--rank-teal), var(--rank-slate), var(--rank-plum), var(--rank-clay))',
  waveform:
    'conic-gradient(from 90deg, var(--rank-teal), var(--rank-jade-bright), var(--rank-teal-deep), var(--rank-jade-bright), var(--rank-teal))',
}

/**
 * Wrap an avatar in the member's bought border. Renders its children untouched when there is no
 * border, or when the stored value resolves to nothing — a member with a retired value keeps a
 * normal avatar rather than an empty halo.
 */
export function CosmeticBorder({
  value,
  children,
}: {
  value: string | null | undefined
  children: React.ReactNode
}) {
  const border = resolveBorder(value)
  if (!border) return <>{children}</>

  if (border.kind === 'ring') {
    return (
      <span
        className={`inline-flex rounded-pill ring-4 ${border.ring}`}
        title={border.label}
      >
        {children}
      </span>
    )
  }

  // A painted border: the sweep IS the ring, so the child sits on a small inset of it. `p-1`
  // (not an arbitrary px) keeps this off the `raw-px-arbitrary` ratchet in adoption-baselines.
  const key = value ? value.trim().replace(/^ring-/, '') : ''
  return (
    <span
      className="inline-flex rounded-pill p-1"
      style={{ backgroundImage: SWEEP[key] ?? SWEEP.gradient }}
      title={border.label}
    >
      {children}
    </span>
  )
}

/** The bought flair: a small icon chip that sits with a member's identity chips. */
export function CosmeticFlair({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const flair = resolveFlair(value)
  if (!flair) return null
  const Icon = FLAIR_ICONS[flair.icon]
  if (!Icon) return null
  return (
    <span
      className={`inline-flex items-center rounded-pill border border-border bg-surface-elevated px-1.5 py-0.5 text-signal-strong ${className}`}
      title={flair.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{flair.label}</span>
    </span>
  )
}

/** The bought title: the words themselves, beside the member's name. */
export function CosmeticTitle({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const title = resolveTitle(value)
  if (!title) return null
  return (
    <span
      className={`inline-flex items-center rounded-pill border border-border bg-surface-elevated px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {title}
    </span>
  )
}
