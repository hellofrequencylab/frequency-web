import type { Metadata } from 'next'
import loadable from 'next/dynamic'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { envFlag } from '@/lib/env/string'
import { getJanitor } from '@/lib/page-editor/guard'
import { EDITABLE_PAGES, getPage, isEditableSlug, resolveSpaceId } from '@/lib/page-editor/data'
import { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
import { listPageVersions } from '@/lib/page-editor/versions'
import { inspectorFieldViews } from '@/lib/builder/inspector-fields'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'
import type { Data } from '@/lib/page-editor/types'
import { AdminPage } from '@/components/admin/admin-page'

export const dynamic = 'force-dynamic'

// A dynamic import, like the website editor's builder loader: the canvas (and the CRDT runtime under it) is its
// own chunk, and no static import ties it to this route's bundle.
const CollabCanvas = loadable(() => import('@/components/builder/canvas/collab-canvas').then((m) => m.CollabCanvas))
// The history scrubber (BLD-403) is its own chunk too, loaded only when a page is picked.
const HistoryPanel = loadable(() => import('@/components/builder/history/history-panel').then((m) => m.HistoryPanel))
export const metadata: Metadata = { title: 'Canvas', robots: { index: false } }

const EMPTY: Data = { content: [], root: {} }

// The inspector's demo block (PROG-E5): the Banner contract's fields for a Space site, derived here on the server so
// the contract and its registry never ship to the client. Starting values are desktop only; tablet and phone inherit.
const BANNER_INSPECTOR = {
  title: 'Banner',
  ...inspectorFieldViews(photoHeroBlock, 'space-site'),
  initial: { title: 'Come as you are', subtitle: 'A line under the headline', height: 'medium', display: 'overlay', buttonOn: true },
}

// THE E4 CANVAS ROUTE (PROG-E4B), dark. Off (and a 404) unless EDITOR_CANVAS is on, and then staff only. It mounts
// the viewport shell with a shared-doc text editor; the live channel for a real entity is a later slice. With
// ?page=<slug> it also mounts that page's version history (BLD-403): preview, restore into the draft, publish.
export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ space?: string | string[]; page?: string | string[] }> }) {
  if (!envFlag('EDITOR_CANVAS')) notFound()
  if (!(await getJanitor())) notFound()
  const { space, page } = await searchParams
  const spaceId = typeof space === 'string' && /^[0-9a-f-]{8,64}$/i.test(space) ? space.toLowerCase() : undefined
  const slug = typeof page === 'string' && isEditableSlug(page) ? page : null
  const history = slug ? await loadHistory(slug, spaceId) : null
  const query = (s: string) => `/pages/canvas?page=${s}${spaceId ? `&space=${spaceId}` : ''}`

  return (
    <AdminPage
      title="Canvas"
      eyebrow="Pages"
      description="The editor canvas on a shared document. Staff preview, switched on with EDITOR_CANVAS."
      width="wide"
    >
      <section aria-label="Page history" className="mb-6 space-y-3">
        <nav aria-label="Pick a page" className="flex flex-wrap gap-2 text-body-sm">
          <span className="text-muted">Version history for</span>
          {EDITABLE_PAGES.map((p) => (
            <Link key={p.slug} href={query(p.slug)} aria-current={p.slug === slug ? 'page' : undefined} className={p.slug === slug ? 'font-semibold' : 'underline'}>
              {p.title}
            </Link>
          ))}
        </nav>
        {history ? (
          <HistoryPanel key={history.slug} slug={history.slug} title={history.title} spaceId={spaceId} initialVersions={history.versions} initialDraft={history.draft} />
        ) : null}
      </section>
      <CollabCanvas spaceId={spaceId} inspector={BANNER_INSPECTOR} />
    </AdminPage>
  )
}

async function loadHistory(slug: string, spaceId?: string) {
  const sid = await resolveSpaceId(spaceId)
  if (!sid) return null
  const [row, versions] = await Promise.all([getPage(slug, sid), listPageVersions(sid, slug)])
  // The same draft the page editor opens: the saved one when well-formed, else the template (ADR-978).
  const draft: Data = isWellFormed(row?.data) ? (row!.data as Data) : getTemplate(slug) ?? EMPTY
  const title = EDITABLE_PAGES.find((p) => p.slug === slug)?.title ?? slug
  return { slug, title, versions, draft }
}
