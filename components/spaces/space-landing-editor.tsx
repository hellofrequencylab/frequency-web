'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Data, Metadata } from '@/lib/page-editor/types'
import { Check } from 'lucide-react'
import { config } from '@/lib/page-editor/config'
import { isError } from '@/lib/action-result'
import { publishSpaceLanding, resetSpaceLanding } from '@/app/(main)/spaces/[slug]/edit-page/actions'
import { ResponsiveEditor } from '@/components/page-editor/mobile/responsive-editor'
import { SpaceEditorProvider } from '@/lib/page-editor/space-editor-context'
import { DesktopEditor, useEditorDoc } from '@/components/page-editor/desktop/desktop-editor'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// THE OPERATOR EDITOR for a Space's public PAGE (multi-page model). Reuses the shared Puck
// config + the marketing editor's publish/baseline pattern, but writes to
// spaces.preferences.pageDocs[pageSlug] through the space-scoped, owner/admin/editor-gated
// actions (every write re-checks canEditProfile server-side, so this client is UX only).
// `pageSlug` names which page is being edited (default Home). The editor runtime ships only
// on this gated route; the public page renders <Render> with no editor code.

// Shown when the call itself throws (network drop, server error), so there is no
// returned message to show. A returned { error } is shown as the server wrote it.
const PUBLISH_THREW = "We couldn't reach the server, so your page didn't publish. Check your connection and try again."
const RESET_THREW = "We couldn't reach the server, so your page wasn't reset. Check your connection and try again."

// The failure line beside the header buttons. role=alert so a screen reader hears it.
function EditorError({ message }: { message: string }) {
  return (
    <span role="alert" className="max-w-xs truncate text-body-sm text-danger" title={message}>
      {message}
    </span>
  )
}

// Publish button: full-colour "Publish now" when there are unpublished edits, dim
// "Published" (with a check) when the live page matches the editor. Reads Puck's
// live document via usePuck and compares it to the last-published baseline.
function PublishButton({ slug, pageSlug }: { slug: string; pageSlug: string }) {
  const doc = useEditorDoc()
  const current = JSON.stringify(doc)

  // Baseline = the document as first loaded (captured once via the initializer; the
  // editor loads the doc as-is, so the initial render never registers as a fake edit).
  const [baseline, setBaseline] = useState(current)
  const [status, setStatus] = useState<'idle' | 'publishing' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const dirty = current !== baseline

  async function handlePublish() {
    if (!dirty || status === 'publishing') return
    setStatus('publishing')
    setError(null)
    // A thrown call (network drop, server error) must land on Retry, never leave the
    // button stuck on Publishing, so every path ends in idle or error.
    let next: 'idle' | 'error' = 'error'
    try {
      const result = await publishSpaceLanding(slug, doc, pageSlug)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setBaseline(JSON.stringify(doc))
      next = 'idle'
    } catch {
      setError(PUBLISH_THREW)
    } finally {
      setStatus(next)
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
    <>
      {status === 'error' && error && <EditorError message={error} />}
      <button
        type="button"
        onClick={handlePublish}
        disabled={!active || status === 'publishing'}
        title={dirty ? 'Publish your changes. They go live immediately' : 'No changes to publish'}
        className={buttonClasses(active ? 'primary' : 'secondary', 'sm', cn(!active && 'cursor-default opacity-60', status === 'publishing' && 'opacity-70'))}
      >
        {!dirty && status === 'idle' && <Check className="h-4 w-4" />}
        {label}
      </button>
    </>
  )
}

// Reset: clears the stored doc so the landing reverts to the generated template
// preset. Shown only when the landing is currently customized (a stored doc exists).
function ResetButton({ slug, pageSlug }: { slug: string; pageSlug: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    if (status === 'working') return
    if (
      !window.confirm(
        'Reset this page to its starting layout? Your saved version is cleared and the page reverts to the default. You can build it up again anytime.',
      )
    )
      return
    setStatus('working')
    setError(null)
    let next: 'idle' | 'error' = 'error'
    try {
      const result = await resetSpaceLanding(slug, pageSlug)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
      next = 'idle'
    } catch {
      setError(RESET_THREW)
    } finally {
      setStatus(next)
    }
  }

  return (
    <>
      {status === 'error' && error && <EditorError message={error} />}
      <button
        type="button"
        onClick={handleReset}
        disabled={status === 'working'}
        title="Clear your saved version. The page reverts to its starting template"
        className="inline-flex items-center px-3 py-1.5 text-body-sm font-medium text-danger hover:text-danger"
      >
        {status === 'working' ? 'Resetting…' : status === 'error' ? 'Retry reset' : 'Reset to template'}
      </button>
    </>
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
  spaceContent,
}: {
  slug: string
  title: string
  data: Data
  /** Whether a stored doc exists for this page (so the Reset affordance shows). */
  customized?: boolean
  /** Which profile page this editor edits + publishes to (default Home). */
  pageSlug?: string
  /** The SAME central content the public landing injects, so the editor renders blocks with the
   *  operator's REAL data (WYSIWYG) rather than empty placeholders. Passed as Puck `metadata.space`. */
  spaceContent?: unknown
}) {
  const exitHref = `/spaces/${slug}`
  const metadata: Metadata | undefined = spaceContent ? { space: spaceContent } : undefined
  const exitControl = (
    <Link
      href={exitHref}
      className="inline-flex items-center px-3 py-1.5 text-body-sm font-medium text-muted hover:text-text"
    >
      ← Exit
    </Link>
  )
  return (
    <SpaceEditorProvider slug={slug}>
    <ResponsiveEditor
      desktop={
        <DesktopEditor
          config={config}
          // A Space page injects `metadata.space`, so it keeps the Space profile + link-tree blocks and
          // drops the Circles-index set, which binds only on /circles (palette-scope.ts).
          surface="space"
          data={data}
          metadata={metadata}
          headerTitle={`Editing: ${title}`}
          headerActions={
            <>
              {exitControl}
              {customized && <ResetButton slug={slug} pageSlug={pageSlug} />}
              <PublishButton slug={slug} pageSlug={pageSlug} />
            </>
          }
        />
      }
      mobile={{
        config,
        surface: 'space',
        data,
        metadata,
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
