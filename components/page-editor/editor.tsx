'use client'

import { useState } from 'react'
import { Puck, usePuck, type Data } from '@measured/puck'
import '@measured/puck/puck.css'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { publishPage } from '@/app/edit/actions'

// Dynamic publish button: full-colour "Publish now" when there are unpublished
// edits, dim "Published" (with a check) when the live page matches the editor.
// Reads Puck's live document via usePuck and compares it to the last-published
// baseline (captured after Puck finishes its own init, so normalisation doesn't
// register as a fake edit).
function PublishButton({ slug }: { slug: string }) {
  const { appState } = usePuck()
  const current = JSON.stringify(appState.data)

  // Baseline = the document as first loaded (the live/published version).
  // Captured once via the useState initializer.
  const [baseline, setBaseline] = useState(current)
  const [status, setStatus] = useState<'idle' | 'publishing' | 'error'>('idle')

  const dirty = current !== baseline

  async function handlePublish() {
    if (!dirty || status === 'publishing') return
    setStatus('publishing')
    try {
      await publishPage(slug, appState.data)
      setBaseline(JSON.stringify(appState.data))
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  const label =
    status === 'publishing'
      ? 'Publishing…'
      : status === 'error'
        ? 'Retry publish'
        : dirty
          ? 'Publish now'
          : 'Published'

  const active = dirty || status === 'error'

  return (
    <button
      type="button"
      onClick={handlePublish}
      disabled={!active || status === 'publishing'}
      title={dirty ? 'Publish your changes — they go live immediately' : 'No changes to publish'}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover'
          : 'bg-surface-elevated text-subtle cursor-default'
      } ${status === 'publishing' ? 'opacity-70' : ''}`}
    >
      {!dirty && status === 'idle' && <Check className="h-4 w-4" />}
      {label}
    </button>
  )
}

// Full-screen Puck editor for a marketing page. Admin-only (the editor runtime
// only loads here; the public site never ships it).
export function PageEditor({ slug, title, data }: { slug: string; title: string; data: Data }) {
  return (
    <Puck
      config={config}
      data={data}
      headerTitle={`Editing: ${title}`}
      overrides={{
        headerActions: () => (
          <>
            <Link
              href="/pages"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-[#555] hover:text-black"
            >
              ← Exit
            </Link>
            <PublishButton slug={slug} />
          </>
        ),
      }}
    />
  )
}
