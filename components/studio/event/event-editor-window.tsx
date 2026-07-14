'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { StudioWindow } from '@/components/studio/studio-window'

// Wraps the event create/edit form in the shared Studio popup, so making or editing an Event is
// the same fully-featured popup as a Practice or Journey — no full page. The form owns its own
// submit; the window provides the chrome and closes back to `backHref`.
export function EventEditorWindow({ backHref, children }: { backHref: string; children: ReactNode }) {
  const router = useRouter()

  return (
    <StudioWindow open onClose={() => router.push(backHref)} eyebrow="Studio · Event">
      {/* Bleed past the StudioWindow body padding so the header + footer read as full-width
          Canvas bands, and the editing area sits on a clearly contrasting Surface panel. */}
      <div className="-mx-4 -my-5 sm:-mx-6">
        {/* Header band (Canvas): the Frequency brandmark beside a warm one-line invitation. */}
        <header className="flex items-center gap-3 bg-canvas px-4 py-4 sm:px-6">
          <span className="brandmark h-5 shrink-0 aspect-[963/170]" aria-hidden />
          <p className="text-sm font-semibold text-text">Share an Event with the community!</p>
        </header>

        {/* Editing area (Surface): the scrollable form body, set off from the Canvas chrome. */}
        <div className="border-y border-border bg-surface px-4 py-5 sm:px-6">{children}</div>

        {/* Skinny footer band (Canvas): one in-voice line, no em dashes. */}
        <footer className="bg-canvas px-4 py-3 text-center sm:px-6">
          <p className="text-2xs leading-relaxed text-muted">
            The best gatherings start with someone deciding to host one.
          </p>
        </footer>
      </div>
    </StudioWindow>
  )
}
