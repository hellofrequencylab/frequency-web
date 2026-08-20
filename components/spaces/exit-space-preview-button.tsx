'use client'

import { useTransition } from 'react'
import { X } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { exitSpacePreview } from '@/app/(main)/view-as-actions'

// "Exit preview" — the way OUT of a staff Space preview (LIVE-062). previewAsSpace (the
// per-card affordance on /admin/spaces) sets the entity view-as cookie for 8 hours, and until
// this button existed nothing cleared it: the ladder control's exit only shows when the
// COMMUNITY role is downgraded, which an entity preview never does, so a staffer sat in the
// preview (with the staff axis stripped by getStaffMember) for the cookie's whole life.
//
// The action is the authority: it re-checks the caller, deletes the cookie, and revalidates
// the whole layout. It performs no redirect, so we stay put and hard-reload — the same full
// repaint ViewAsControl does on a ladder change — and the shell comes back as the staffer's
// own view.
//
// COPY (CONTENT-VOICE §10): "Exit preview" is plain, matches the banner's "Staff preview"
// heading, no narrated feelings, no em dashes.
export function ExitSpacePreviewButton() {
  const [pending, start] = useTransition()

  function exit() {
    start(async () => {
      await exitSpacePreview()
      // Full reload so the cookie's absence is reflected everywhere (chrome, staff axis,
      // capabilities) — not just a soft re-render of this page.
      window.location.reload()
    })
  }

  return (
    <button
      type="button"
      onClick={exit}
      disabled={pending}
      className={buttonClasses('secondary', 'sm', 'shrink-0')}
    >
      <X className="h-3.5 w-3.5" aria-hidden /> Exit preview
    </button>
  )
}
