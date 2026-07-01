'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Data } from '@measured/puck'
import { LayoutTemplate, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// THE FULL PAGE EDITOR OVERLAY (the Manage "Page" panel's deep-edit entry). The compact Page panel
// handles fast tweaks (layout, cover, accent, block order + show/hide) with NO Puck; this button opens
// the COMPLETE Puck editor as a fullscreen overlay OVER the Manage page, rather than navigating to a
// separate route. The heavy editor + @measured/puck bundle is LAZY-LOADED via next/dynamic (ssr:false)
// only when the overlay opens, so the Manage page's initial load never ships the editor runtime, and the
// public profile never does either (it renders <Render> only).
//
// The editor itself (components/spaces/space-landing-editor.tsx) is UNCHANGED and reused: it carries the
// same publish/reset actions, the warm Puck chrome (puck-theme.css), and the mobile WYSIWYG fallback
// (ResponsiveEditor). Exit closes the overlay (onExit); the standalone /spaces/[slug]/edit-page route
// keeps working (no onExit there = a Link back to the profile).

// Lazy chunk: the editor + Puck load only when this resolves (on open), never on the Manage page load.
const SpaceLandingEditor = dynamic(
  () => import('@/components/spaces/space-landing-editor').then((m) => m.SpaceLandingEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-canvas">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading the editor
        </span>
      </div>
    ),
  },
)

export function SpaceEditorOverlay({
  slug,
  title,
  data,
  customized = false,
  pageSlug = 'home',
}: {
  slug: string
  title: string
  /** The resolved page doc (stored-or-default, hidden blocks already stripped) the editor opens on. */
  data: Data
  /** Whether a stored doc exists for this page (so the editor shows the Reset affordance). */
  customized?: boolean
  /** Which profile page the editor edits + publishes to (default Home). */
  pageSlug?: string
}) {
  const [open, setOpen] = useState(false)

  // Lock the page scroll while the overlay is open + close on Escape (the overlay is a takeover).
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

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <LayoutTemplate className="h-4 w-4" aria-hidden />
        Full page editor
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full page editor for ${title}`}
          className="fixed inset-0 z-[100] bg-canvas"
        >
          <SpaceLandingEditor
            slug={slug}
            title={title}
            data={data}
            customized={customized}
            pageSlug={pageSlug}
            onExit={() => setOpen(false)}
          />
        </div>
      )}
    </>
  )
}
