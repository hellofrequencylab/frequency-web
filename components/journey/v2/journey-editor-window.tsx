'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { StudioWindow } from '@/components/studio/studio-window'
import { StudioFooter } from '@/components/studio/kit/studio-footer'

// Wraps the journey structure editor (Settings + tree + Advanced) in the shared Studio popup, so
// editing a Journey is the same fully-featured popup as a Practice — no full page. The editor
// autosaves, so the footer is just a Done that closes back to the library.
export function JourneyEditorWindow({ children }: { children: ReactNode }) {
  const router = useRouter()
  const close = () => router.push('/journeys')

  return (
    <StudioWindow
      open
      onClose={close}
      eyebrow="Studio · Journey"
      footer={
        <StudioFooter left={<span className="text-xs text-subtle">Changes autosave.</span>}>
          <button
            type="button"
            onClick={close}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Done
          </button>
        </StudioFooter>
      }
    >
      {children}
    </StudioWindow>
  )
}
