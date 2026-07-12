// The marketplace listing hero — "hero ad format" (Classifieds / Market / Housing share it).
// The lead image runs full-bleed with an ink scrim, and the Title (the page h1), a Category pill,
// the Price, and the primary Action button sit overlaid on it. When there is no image a neutral
// DAWN gradient placeholder stands in (mirrors the events hero's no-cover fill). Presentational
// Server Component: it takes already-resolved data + a plain action link, no hooks.

import Image from 'next/image'
import Link from 'next/link'
import { ImageIcon, MessageCircle, Pencil } from 'lucide-react'
import type { ListingAction } from '@/lib/listings-shared/detail-view'

export function ListingHero({
  title,
  image,
  categoryLabel,
  priceLabel,
  action,
}: {
  title: string
  image: string | null
  categoryLabel: string | null
  priceLabel: string | null
  action: ListingAction | null
}) {
  const hasAction = !!action && action.kind !== 'none'
  const ActionIcon = action?.kind === 'edit' ? Pencil : MessageCircle

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface-elevated sm:aspect-[16/7]">
      {image ? (
        <>
          {/* Listing photos live in the public event-media bucket (or are already absolute URLs);
              bypass the optimizer to match the events gallery + cover treatment. */}
          <Image src={image} alt="" fill sizes="(max-width: 1024px) 100vw, 1344px" preload unoptimized className="object-cover" />
          {/* Ink scrim so the overlaid title/price stay legible over any photo. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
          <ImageIcon className="h-10 w-10 opacity-50" aria-hidden />
        </div>
      )}

      {/* Overlaid content lockup, bottom-anchored. Over an image it sits on the scrim in white; over
          the no-image placeholder it reads in the DAWN text tokens. */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4 sm:p-6 ${image ? 'text-white' : 'text-text'}`}>
        {categoryLabel && (
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${
              image ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-primary-bg text-primary-strong'
            }`}
          >
            {categoryLabel}
          </span>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight break-words sm:text-3xl">{title}</h1>
            {priceLabel && (
              <p className={`mt-1 text-base font-semibold sm:text-lg ${image ? 'text-white/90' : 'text-text'}`}>
                {priceLabel}
              </p>
            )}
          </div>

          {hasAction && (
            <Link
              href={action!.href}
              className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                image
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-primary text-on-primary hover:bg-primary-hover'
              }`}
            >
              <ActionIcon className="h-4 w-4" aria-hidden />
              {action!.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
