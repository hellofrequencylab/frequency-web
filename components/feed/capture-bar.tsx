'use client'

import { CaptureBox } from './capture-box'

// The feed's inline Capture box (the rework): the old post box, now multi-mode with
// a bottom rail. A thin wrapper over CaptureBox so the feed mount stays put.
export function CaptureBar({
  scopeId,
  visibility = 'group',
  placeholder = 'What’s on your mind?',
  canAnnounce = false,
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
}) {
  return <CaptureBox scopeId={scopeId} visibility={visibility} placeholder={placeholder} canAnnounce={canAnnounce} />
}
