import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditorControlsShowcase } from './showcase'

// DEV-ONLY SHOWCASE (ADR-569) — every reusable editor-control PRIMITIVE + a sample redesigned block panel,
// rendered without auth so the control-surface redesign can be eyeballed and QA'd without logging into the
// owner editor (which is auth-gated). Route: /dev/editor-controls. NOINDEX and gated to non-production, so it
// never ships to the public site or the crawl. Not linked from anywhere; a developer opens it directly.

export const metadata: Metadata = {
  title: 'Editor controls (dev)',
  robots: { index: false, follow: false },
}

export default function EditorControlsDevPage() {
  // Never expose the sandbox in production, even though it is noindex + unlinked.
  if (process.env.NODE_ENV === 'production') notFound()
  return <EditorControlsShowcase />
}
