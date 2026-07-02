'use client'

// THE WYSIWYG LIVE PREVIEW for the mobile Spotlight editor. It renders the member's ACTUAL
// themed Spotlight page from LIVE editor state and updates as they edit — the same visual as
// the public page (theme wrapper + background + identity header + Puck-rendered blocks with
// the member's card style / fonts / accent), NOT the raw blocks on a plain canvas.
//
// TAP-TO-EDIT: every top-level content block is rendered inside its own tappable wrapper, so a
// tap maps unambiguously to that block's id → `onEditBlock(id)` (the editor then opens the
// block's field form in a popup). Rendering each block through its OWN single-item <BlockRender>
// (see lib/spotlight/puck/preview-blocks.ts) keeps the output identical to live while giving a
// clean tap→id mapping — no brittle DOM walk. Structural/background taps do nothing.
//
// CLIENT: uses the in-house <BlockRender> with the SAME metadata channel the live RSC page passes
// (publicBase + stats + topFriends), so blocks look identical to the public page. The card style /
// heading font ride the theme wrapper + block styling exactly as live.

import { BlockRender } from '@/lib/page-editor/block-render'
import type { Config, Data } from '@/lib/page-editor/types'
import { Pencil } from 'lucide-react'
import type { SpotlightTheme } from '@/lib/spotlight/theme'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import { toPreviewBlocks } from '@/lib/spotlight/puck/preview-blocks'
import { SpotlightThemedShell, type SpotlightIdentity } from './spotlight-identity'

export function SpotlightLivePreview({
  config,
  data,
  theme,
  background,
  identity,
  metadata,
  onEditBlock,
}: {
  config: Config
  data: Data
  theme: SpotlightTheme
  background: SpotlightBackground
  identity: SpotlightIdentity
  /** The SAME metadata channel the live page passes (spotlight: publicBase + stats + topFriends). */
  metadata?: Record<string, unknown>
  /** Fired when the member taps a block in the preview, with that block's stable id. */
  onEditBlock: (blockId: string) => void
}) {
  const blocks = toPreviewBlocks(data)

  return (
    <SpotlightThemedShell theme={theme} background={background} identity={identity} contained>
      {blocks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-8 text-center text-sm text-muted">
          Add a block to start building your page.
        </p>
      ) : (
        blocks.map(({ id, doc }) => (
          <button
            key={id}
            type="button"
            onClick={() => onEditBlock(id)}
            aria-label="Edit this block"
            // A full-width tappable wrapper over the real, themed block. The block renders
            // exactly as live; the wrapper adds only a press affordance (a ring + edit chip),
            // never any layout shift, so nothing jumps when a member taps.
            className="group relative block w-full rounded-2xl text-left outline-none ring-primary transition-shadow focus-visible:ring-2 active:ring-2"
          >
            {/* The real themed block. Pointer-events are disabled so inner links/iframes never
                fire; the whole wrapper is one edit target. */}
            <div className="pointer-events-none">
              <BlockRender config={config} data={doc} metadata={metadata} />
            </div>
            {/* "Edit" affordance: hidden until press/focus so the preview reads clean. */}
            <span
              className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-semibold text-on-primary opacity-0 shadow-sm transition-opacity group-active:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            >
              <Pencil className="h-3 w-3" /> Edit
            </span>
          </button>
        ))
      )}
    </SpotlightThemedShell>
  )
}
