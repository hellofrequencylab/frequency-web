'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import type { SpotlightRow } from '@/lib/spotlight/privacy'
import type { SpotlightData, SpotlightHostedEvent } from '@/lib/spotlight/data'
import type { SpotlightTheme } from '@/lib/spotlight/theme'
import {
  type SpotlightBlock,
  type SpotlightLayout,
  type SpotlightBackground,
  SPOTLIGHT_LAYOUT_VERSION,
} from '@/lib/spotlight/blocks/schema'
import { SpotlightPublishBar } from './publish-bar'
import { SpotlightThemeEditor } from './theme-editor'
import { LayoutEditor } from './layout-editor'
import { SpotlightView } from './spotlight-view'

// The Spotlight builder: controls on the LEFT, a LIVE preview of the actual page on the
// RIGHT (the same SpotlightView the public route renders, so they can't drift). One source
// of truth for theme + blocks + background lives here, passed controlled into each editor,
// so every edit re-renders the preview instantly. The editors keep their own Save buttons.
export function SpotlightBuilder({
  handle,
  published,
  profile,
  hostedEvents,
  totalZaps,
  initialTheme,
  initialLayout,
  initialBackground,
}: {
  handle: string
  published: boolean
  profile: SpotlightRow
  hostedEvents: SpotlightHostedEvent[]
  totalZaps: number
  initialTheme: SpotlightTheme
  initialLayout: SpotlightLayout
  initialBackground: SpotlightBackground
}) {
  const [theme, setTheme] = useState<SpotlightTheme>(initialTheme)
  const [blocks, setBlocks] = useState<SpotlightBlock[]>(initialLayout.blocks)
  const [background, setBackground] = useState<SpotlightBackground>(initialBackground)
  const [mobilePreview, setMobilePreview] = useState(false)

  const previewData: SpotlightData = {
    profile,
    hostedEvents,
    layout: { version: SPOTLIGHT_LAYOUT_VERSION, blocks },
    background,
    theme,
    totalZaps,
  }

  const preview = (
    <div className="overflow-hidden rounded-2xl border border-border-strong bg-canvas shadow-sm">
      {/* The preview is non-interactive (links shouldn't navigate); the box still scrolls. */}
      <div className="pointer-events-none">
        <SpotlightView data={previewData} contained />
      </div>
    </div>
  )

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
      {/* Controls */}
      <div className="min-w-0 space-y-6">
        <SpotlightPublishBar handle={handle} initialPublished={published} />

        {/* Mobile: toggle the live preview (the right rail is lg-only). */}
        <button
          type="button"
          onClick={() => setMobilePreview((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated lg:hidden"
        >
          <Eye className="h-4 w-4" /> {mobilePreview ? 'Hide preview' : 'Show live preview'}
        </button>
        {mobilePreview && <div className="lg:hidden">{preview}</div>}

        <SpotlightThemeEditor value={theme} onChange={setTheme} showPreview={false} />
        <LayoutEditor
          blocks={blocks}
          onBlocksChange={setBlocks}
          background={background}
          onBackgroundChange={setBackground}
          handle={handle}
        />
      </div>

      {/* Live preview (sticky, lg+) */}
      <div className="hidden lg:block">
        <div className="sticky top-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Live preview</p>
          <div className="max-h-[78vh] overflow-y-auto rounded-2xl border border-border-strong">
            {preview}
          </div>
        </div>
      </div>
    </div>
  )
}
