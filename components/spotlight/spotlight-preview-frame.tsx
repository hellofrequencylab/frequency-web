'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'

// THE SPOTLIGHT EDITOR'S PREVIEW (LIVE-2452). The real Spotlight page (app/spaces/[slug]/spotlight/preview) in a
// phone-width frame that stays in view while the owner scrolls the editor. Inside an iframe the page wears only
// its own theme: no member or console style can reach it, so what the owner sees is what a visitor gets. The
// editor saves as it goes; when a save lands (or `version` moves, for a theme or look change) the frame reloads
// and keeps its scroll place. Voice canon: no em dashes.

export function SpotlightPreviewFrame({ slug, version }: { slug: string; version: number }) {
  const nodeStore = useNodeLayout()
  const legacyStore = useProfileLayout()
  const saving = !!(nodeStore?.saving || nodeStore?.dirty || legacyStore?.saving || legacyStore?.dirty)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const scrollY = useRef(0)
  const [loading, setLoading] = useState(true)
  const wasSaving = useRef(saving)
  const lastVersion = useRef(version)

  // Draw the page again when a save has just finished, or a theme or look change has landed.
  useEffect(() => {
    const saved = wasSaving.current && !saving
    const restyled = lastVersion.current !== version
    wasSaving.current = saving
    lastVersion.current = version
    if (!saved && !restyled) return
    const win = frame.current?.contentWindow
    if (!win) return
    try {
      scrollY.current = win.scrollY
      win.location.reload()
    } catch {
      // A frame we cannot reach (navigated away): leave it as it is.
    }
  }, [saving, version])

  const onLoad = () => {
    setLoading(false)
    try {
      frame.current?.contentWindow?.scrollTo(0, scrollY.current)
    } catch {
      // Same origin by construction; nothing to restore otherwise.
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-card border border-border bg-canvas lift-1">
        <iframe
          ref={frame}
          src={`/spaces/${slug}/spotlight/preview`}
          title="Preview of your Spotlight"
          onLoad={onLoad}
          className="block h-[calc(100dvh-9rem)] max-h-[48rem] w-full"
        />
      </div>
      {(loading || saving) && (
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-pill bg-surface px-2 py-1 text-2xs text-muted lift-1" role="status" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Updating
        </span>
      )}
    </div>
  )
}
