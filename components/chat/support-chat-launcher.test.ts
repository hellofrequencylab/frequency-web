import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { staticModuleEdges } from '../../scripts/check-shell-weight.mjs'

// SCAN-674: the launcher is the only part of the contact dock in a public page's first-load JS. These
// read the SOURCE edges (the same classifier Arm C of check-shell-weight uses), because a static
// import below a 'use client' boundary is not code-split by any bundler setting: if one of these
// edges comes back, supabase-js is back in every marketing, help and discover page.

const ROOT = path.join(import.meta.dirname, '..', '..')
const edges = (rel: string) => staticModuleEdges(readFileSync(path.join(ROOT, rel), 'utf8')) as string[]

describe('the support chat launcher keeps supabase-js out of the public first load', () => {
  it('the launcher never statically imports the panel or the Supabase client', () => {
    const e = edges('components/chat/support-chat-launcher.tsx')
    expect(e).not.toContain('./support-chat-widget')
    expect(e).not.toContain('@/lib/supabase/client')
    expect(e.length).toBeGreaterThan(0)
  })

  it('the panel itself loads the Supabase client lazily', () => {
    expect(edges('components/chat/support-chat-widget.tsx')).not.toContain('@/lib/supabase/client')
  })

  it('the three public layouts mount the launcher, not the widget', () => {
    for (const layout of ['app/(marketing)/layout.tsx', 'app/(help)/layout.tsx', 'app/discover/layout.tsx']) {
      const e = edges(layout)
      expect(e, layout).toContain('@/components/chat/support-chat-launcher')
      expect(e, layout).not.toContain('@/components/chat/support-chat-widget')
    }
  })

  it('the detector sees a static import when there is one (positive control)', () => {
    expect(staticModuleEdges("import { SupportChatWidget } from '@/components/chat/support-chat-widget'")).toContain(
      '@/components/chat/support-chat-widget',
    )
  })
})
