'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { StudioWindow } from '@/components/studio/studio-window'

// Wraps the host's circle settings editor in the shared Studio popup, so editing a Circle is the
// same fully-featured popup as a Practice or Journey — no full page. The form owns its own Save
// action; the window provides the chrome and closes back to the circle.
export function CircleEditorWindow({ slug, children }: { slug: string; children: ReactNode }) {
  const router = useRouter()
  const close = () => router.push(`/circles/${slug}`)

  return (
    <StudioWindow open onClose={close} eyebrow="Studio · Circle">
      {children}
    </StudioWindow>
  )
}
