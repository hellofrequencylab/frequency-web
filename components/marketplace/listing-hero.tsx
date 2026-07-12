// The marketplace listing hero — "hero ad format" (Classifieds / Market / Housing share it).
// The lead image runs full-bleed with an ink scrim. A short PRICE badge sits in the TOP-LEFT corner
// and the CATEGORY pill in the TOP-RIGHT; the Title (the page h1) and the primary Action sit overlaid
// along the bottom. When there is no image a neutral DAWN gradient placeholder stands in (mirrors the
// events hero's no-cover fill). Presentational Server Component: it takes already-resolved data plus an
// optional `actionSlot` node (the Contact dialog trigger or an Edit link) so the interactive bits stay
// out of this server component.

import Image from 'next/image'
import { ImageIcon } from 'lucide-react'

export function ListingHero({
  title,
  image,
  categoryLabel,
  priceShort,
  actionSlot,
}: {
  title: string
  image: string | null
  categoryLabel: string | null
  /** The SHORT price for the top-left badge, e.g. "$299" (never the long price note). */
  priceShort: string | null
  /** Bottom-right CTA node (the Contact dialog trigger, or an Edit link for the owner). */
  actionSlot?: React.ReactNode
}) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface-elevated sm:aspect-[16/7]">
      {image ? (
        <>
          {/* Listing photos live in the public event-media bucket (or are already absolute URLs);
              bypass the optimizer to match the events gallery + cover treatment. */}
          <Image src={image} alt="" fill sizes="(max-width: 1024px) 100vw, 1344px" preload unoptimized className="object-cover" />
          {/* Ink scrim so the overlaid title/badges stay legible over any photo. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/25" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
          <ImageIcon className="h-10 w-10 opacity-50" aria-hidden />
        </div>
      )}

      {/* TOP-LEFT: the short price badge (the hero-ad price tag). */}
      {priceShort && (
        <span
          className={`absolute left-4 top-4 inline-flex items-center rounded-xl px-3 py-1.5 text-lg font-bold shadow-sm sm:text-xl ${
            image ? 'bg-white text-black' : 'bg-primary text-on-primary'
          }`}
        >
          {priceShort}
        </span>
      )}

      {/* TOP-RIGHT: the category pill. */}
      {categoryLabel && (
        <span
          className={`absolute right-4 top-4 inline-flex items-center rounded-full px-3 py-1 text-2xs font-semibold uppercase tracking-wide ${
            image ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-primary-bg text-primary-strong'
          }`}
        >
          {categoryLabel}
        </span>
      )}

      {/* BOTTOM: the title (h1) + the primary action, anchored to the base of the scrim. */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:p-6 ${image ? 'text-white' : 'text-text'}`}>
        <h1 className="min-w-0 text-2xl font-bold leading-tight break-words sm:text-3xl">{title}</h1>
        {actionSlot && <div className="shrink-0">{actionSlot}</div>}
      </div>
    </div>
  )
}
