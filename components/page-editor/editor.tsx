'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Puck, usePuck } from '@measured/puck'
import type { Data } from '@/lib/page-editor/types'
import '@measured/puck/puck.css'
import '@/components/page-editor/puck-theme.css'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { publishPage, unpublishPage } from '@/app/edit/actions'
import { ResponsiveEditor } from '@/components/page-editor/mobile/responsive-editor'

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
      title={dirty ? 'Publish your changes. They go live immediately' : 'No changes to publish'}
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

// Unpublish: clears the live document so the public route falls back to the
// hardcoded (coded) design. Shown only when the page is currently published.
// The editor draft is kept, so this is reversible (just Publish again).
function UnpublishButton({ slug }: { slug: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  async function handleUnpublish() {
    if (status === 'working') return
    if (
      !window.confirm(
        'Unpublish this page? The public site will show the built-in (coded) design instead. Your editor draft is kept, so you can re-publish anytime.',
      )
    )
      return
    setStatus('working')
    try {
      await unpublishPage(slug)
      router.refresh()
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  return (
    <button
      type="button"
      onClick={handleUnpublish}
      disabled={status === 'working'}
      title="Take the editor version offline. The public page reverts to the coded design"
      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-danger hover:text-danger"
    >
      {status === 'working' ? 'Unpublishing…' : status === 'error' ? 'Retry unpublish' : 'Unpublish'}
    </button>
  )
}

// Full-screen Puck editor for a marketing page. Admin-only (the editor runtime
// only loads here; the public site never ships it).
export function PageEditor({
  slug,
  title,
  data,
  published = false,
}: {
  slug: string
  title: string
  data: Data
  published?: boolean
}) {
  return (
    <ResponsiveEditor
      desktop={
        <Puck
          config={config}
          data={data}
          headerTitle={`Editing: ${title}`}
          overrides={{
            headerActions: () => (
              <>
                <Link
                  href="/pages"
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
                >
                  ← Exit
                </Link>
                {published && <UnpublishButton slug={slug} />}
                <PublishButton slug={slug} />
              </>
            ),
          }}
        />
      }
      mobile={{
        config,
        data,
        title,
        // Marketing pages have no draft-only path: like the desktop <Puck>, edits
        // persist only on Publish (which writes both draft + live). So no onSaveDraft.
        onPublish: (doc) => publishPage(slug, doc),
        publishLabel: 'Publish now',
      }}
    />
  )
}
