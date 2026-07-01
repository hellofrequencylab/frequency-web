'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Puck, usePuck, type Data } from '@measured/puck'
import '@measured/puck/puck.css'
import '@/components/page-editor/puck-theme.css'
import { Check } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { isError } from '@/lib/action-result'
import { publishSpaceLanding, resetSpaceLanding } from '@/app/(main)/spaces/[slug]/edit-page/actions'
import { ResponsiveEditor } from '@/components/page-editor/mobile/responsive-editor'
import { SpaceEditorProvider } from '@/lib/page-editor/space-editor-context'

// THE OPERATOR EDITOR for a Space's public PAGE (multi-page model). Reuses the shared Puck
// config + the marketing editor's publish/baseline pattern, but writes to
// spaces.preferences.pageDocs[pageSlug] through the space-scoped, owner/admin/editor-gated
// actions (every write re-checks canEditProfile server-side, so this client is UX only).
// `pageSlug` names which page is being edited (default Home). The editor runtime ships only
// on this gated route; the public page renders <Render> with no editor code.

// Publish button: full-colour "Publish now" when there are unpublished edits, dim
// "Published" (with a check) when the live page matches the editor. Reads Puck's
// live document via usePuck and compares it to the last-published baseline.
function PublishButton({ slug, pageSlug }: { slug: string; pageSlug: string }) {
  const { appState } = usePuck()
  const current = JSON.stringify(appState.data)

  // Baseline = the document as first loaded (captured once via the initializer, so
  // Puck's own normalisation never registers as a fake edit).
  const [baseline, setBaseline] = useState(current)
  const [status, setStatus] = useState<'idle' | 'publishing' | 'error'>('idle')

  const dirty = current !== baseline

  async function handlePublish() {
    if (!dirty || status === 'publishing') return
    setStatus('publishing')
    const result = await publishSpaceLanding(slug, appState.data, pageSlug)
    if (isError(result)) {
      setStatus('error')
      return
    }
    setBaseline(JSON.stringify(appState.data))
    setStatus('idle')
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

// Reset: clears the stored doc so the landing reverts to the generated template
// preset. Shown only when the landing is currently customized (a stored doc exists).
function ResetButton({ slug, pageSlug }: { slug: string; pageSlug: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  async function handleReset() {
    if (status === 'working') return
    if (
      !window.confirm(
        'Reset this page to its starting layout? Your saved version is cleared and the page reverts to the default. You can build it up again anytime.',
      )
    )
      return
    setStatus('working')
    const result = await resetSpaceLanding(slug, pageSlug)
    if (isError(result)) {
      setStatus('error')
      return
    }
    router.refresh()
    setStatus('idle')
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={status === 'working'}
      title="Clear your saved version. The page reverts to its starting template"
      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-danger hover:text-danger"
    >
      {status === 'working' ? 'Resetting…' : status === 'error' ? 'Retry reset' : 'Reset to template'}
    </button>
  )
}

// Full-screen Puck editor for a Space page. Owner/admin/editor-gated at the route;
// the editor runtime loads only here, never on the public profile. Exit is a Link back
// to the public profile (the standalone /edit-page route is the only entry).
export function SpaceLandingEditor({
  slug,
  title,
  data,
  customized = false,
  pageSlug = 'home',
}: {
  slug: string
  title: string
  data: Data
  /** Whether a stored doc exists for this page (so the Reset affordance shows). */
  customized?: boolean
  /** Which profile page this editor edits + publishes to (default Home). */
  pageSlug?: string
}) {
  const exitHref = `/spaces/${slug}`
  const exitControl = (
    <Link
      href={exitHref}
      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
    >
      ← Exit
    </Link>
  )
  return (
    <SpaceEditorProvider slug={slug}>
    <ResponsiveEditor
      desktop={
        <Puck
          config={config}
          data={data}
          headerTitle={`Editing: ${title}`}
          overrides={{
            headerActions: () => (
              <>
                {exitControl}
                {customized && <ResetButton slug={slug} pageSlug={pageSlug} />}
                <PublishButton slug={slug} pageSlug={pageSlug} />
              </>
            ),
          }}
        />
      }
      mobile={{
        config,
        data,
        title,
        // Space landings persist only on Publish (same model as the desktop editor), so
        // no draft-only save. Publish re-checks the owner/admin/editor gate server-side;
        // surface a failure by throwing so the mobile Publish shows "Retry".
        onPublish: async (doc) => {
          const res = await publishSpaceLanding(slug, doc, pageSlug)
          if (isError(res)) throw new Error('Publish failed')
        },
        publishLabel: 'Publish now',
      }}
    />
    </SpaceEditorProvider>
  )
}
