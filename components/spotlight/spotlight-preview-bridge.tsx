'use client'

import { useEffect } from 'react'

// THE PREVIEW FRAME'S SIDE OF THE SPOTLIGHT EDITOR (LIVE-2452). Mounted only on the editor's preview page
// (app/spaces/[slug]/spotlight/preview), which the editor shows in an iframe. A press on a link or a form
// button inside the preview does nothing: the owner is editing, not visiting, so nothing navigates away and no
// visitor click is counted. Voice canon: no em dashes.

export function SpotlightPreviewBridge() {
  useEffect(() => {
    const stop = (e: Event) => {
      const t = e.type === 'submit' ? e.target : e.target instanceof Element ? e.target.closest('a[href], button[type="submit"]') : null
      if (!t) return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('click', stop, true)
    document.addEventListener('submit', stop, true)
    return () => {
      document.removeEventListener('click', stop, true)
      document.removeEventListener('submit', stop, true)
    }
  }, [])
  return null
}
