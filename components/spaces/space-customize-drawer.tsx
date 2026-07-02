'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { SpacePagePanel, type FocusChoiceLike } from '@/components/spaces/space-page-panel'
import { OPEN_SPACE_CUSTOMIZE } from '@/components/spaces/space-customize-button'
import type { SpaceBlockRow } from '@/lib/page-editor/templates/space-blocks'
import type { ProfilePage } from '@/lib/spaces/profile-pages'
import type { SpaceProfileData } from '@/lib/spaces/profile-data'
import type { CoverSize, CoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'

// THE SPACE CUSTOMIZE RAIL — the right-hand settings drawer the profile's single "Customize" button
// opens (SpaceCustomizeButton dispatches OPEN_SPACE_CUSTOMIZE). It is SPACE-SCOPED and owner-gated: the
// (profile) chrome renders it only when the viewer can manage the Space, and every control inside still
// re-gates server-side. It reuses the existing SpacePagePanel as its body, so the rail carries the core
// page settings (cover size + scrim, brand accent, the page manager, block order + show/hide) AND the
// prominent "Full page editor" button that opens the fullscreen Puck editor — one surface, no page hop.
//
// A self-contained drawer (not the shell SettingsDrawer) so it is gated on SPACE-manage access rather
// than platform-staff role, and never collides with the shell rail. Slide-over from the right, scroll
// lock + Escape to close, like every other takeover in the app.
export function SpaceCustomizeDrawer({
  slug,
  brandName,
  pages,
  maxPages,
  coverSize,
  coverScrim,
  accent,
  blocks,
  businessInfo,
  coverImageUrl = null,
  brandLogoUrl = null,
  focus = null,
}: {
  slug: string
  brandName: string
  pages: ProfilePage[]
  maxPages: number
  coverSize: CoverSize
  coverScrim: CoverScrim
  accent: string
  blocks: SpaceBlockRow[]
  businessInfo: SpaceProfileData
  coverImageUrl?: string | null
  brandLogoUrl?: string | null
  focus?: { choices: FocusChoiceLike[] } | null
}) {
  const [open, setOpen] = useState(false)

  // Open on the button's window event; close on Escape; lock the page scroll while open.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_SPACE_CUSTOMIZE, onOpen)
    return () => window.removeEventListener(OPEN_SPACE_CUSTOMIZE, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Customize ${brandName}`}>
      {/* Scrim: click to close. */}
      <button
        type="button"
        aria-label="Close customize"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
      />
      {/* The rail. */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-canvas shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Customize</p>
            <p className="truncate text-sm font-bold text-text">{brandName}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <SpacePagePanel
            slug={slug}
            pages={pages}
            activePageSlug="home"
            maxPages={maxPages}
            coverSize={coverSize}
            coverScrim={coverScrim}
            accent={accent}
            blocks={blocks}
            businessInfo={businessInfo}
            coverImageUrl={coverImageUrl}
            brandLogoUrl={brandLogoUrl}
            focus={focus}
          />
        </div>
      </div>
    </div>
  )
}
