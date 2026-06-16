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
      {children}
    </StudioWindow>
  )
}
