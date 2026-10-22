import { Nfc } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SITE_DESIGN } from '@/lib/theme/design'
import { cardEdition, formatCardNumber } from '@/lib/member-cards/face'

// THE MEMBER CARD, drawn (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). The printed face of a
// numbered NTAG215 card: the FREQUENCY wordmark, the edition top right, the holder's name, "No. 0042 ·
// Regular" and the tap wave. One component for every place a card is shown (the Crew "My card" editor,
// a Space's Member cards section, the tap page), so the card never looks different in two places.
//
// Presentational and hook-free, so a Server Component can render it. Colours are tokens only: the
// face is the ink gradient every design fills (DAWN's warm black, Frequency's Stage blue-black through
// the alias layer), with Frequency's iridescent sweep laid over it as a sheen when that design is on.
// Copy obeys CONTENT-VOICE: plain, no em dashes.

const FREQUENCY = SITE_DESIGN === 'frequency'

const EDITION_LABEL = { founders: 'Founders', crew: 'Crew' } as const

// The base face. Every stop is a token from app/globals.css, so both designs paint it.
const FACE_GRADIENT =
  'linear-gradient(135deg, var(--color-ink) 0%, var(--color-ink-elevated) 55%, var(--color-signal-strong) 130%)'
// The sheen. Frequency's sweep when that design is on; otherwise a primary-to-signal wash.
const SHEEN = 'var(--fq-iridescent-sweep, linear-gradient(100deg, var(--color-primary) 0%, var(--color-signal) 100%))'

// Where the sheen shows. A mask reads only alpha, so any opaque token draws the band.
const MASK = 'linear-gradient(160deg, transparent 15%, var(--color-ink) 50%, transparent 85%)'

export function CardPreview({
  name,
  cardNumber,
  stageLabel,
  paused = false,
  className,
}: {
  /** The name printed on the card: the member's display name, or the Space's brand name. */
  name: string
  /** The printed number, or null for a card not written yet (the editor's "set it up first" state). */
  cardNumber: number | null
  /** The holder's stage ("Regular"). Null on a Space card, which has no stage. */
  stageLabel?: string | null
  /** A paused card reads dimmed with a Paused mark, so the owner sees the switch took. */
  paused?: boolean
  className?: string
}) {
  const edition = cardEdition(cardNumber)
  const number = formatCardNumber(cardNumber)
  const meta = [number ?? 'Not written yet', stageLabel].filter(Boolean).join(' · ')

  return (
    <div
      role="img"
      aria-label={`Frequency member card, ${EDITION_LABEL[edition]} edition, ${name}, ${meta}${paused ? ', paused' : ''}`}
      className={cn(
        'relative isolate aspect-[1.586/1] w-full overflow-hidden rounded-card border border-ink-border text-on-ink lift-1',
        paused && 'opacity-60 grayscale',
        className,
      )}
      style={{ backgroundImage: FACE_GRADIENT }}
    >
      {/* The sheen: a soft diagonal band, the light catching the card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-25 mix-blend-screen"
        style={{ backgroundImage: SHEEN, maskImage: MASK }}
      />

      <div className="flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={cn('text-meta font-extrabold uppercase tracking-eyebrow', FREQUENCY && 'fq-iri-text')}>
            Frequency
          </span>
          <span className="rounded-pill border border-on-ink-subtle/40 px-2 py-0.5 text-2xs font-semibold uppercase tracking-eyebrow-soft text-on-ink-muted">
            {EDITION_LABEL[edition]}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-bold leading-tight">{name}</p>
            <p className="mt-0.5 truncate text-meta tabular-nums text-on-ink-muted">{meta}</p>
          </div>
          {paused ? (
            <span className="shrink-0 rounded-pill bg-on-ink/15 px-2 py-0.5 text-2xs font-semibold uppercase tracking-eyebrow-soft">
              Paused
            </span>
          ) : (
            <Nfc aria-hidden className="h-7 w-7 shrink-0 text-on-ink-muted" />
          )}
        </div>
      </div>
    </div>
  )
}
