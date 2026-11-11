import type { Metadata } from 'next'
import loadable from 'next/dynamic'
import { notFound } from 'next/navigation'
import { envFlag } from '@/lib/env/string'
import { getJanitor } from '@/lib/page-editor/guard'
import { AdminPage } from '@/components/admin/admin-page'

export const dynamic = 'force-dynamic'

// A dynamic import, like the website editor's builder loader: the canvas (and the CRDT runtime under it) is its
// own chunk, and no static import ties it to this route's bundle.
const CollabCanvas = loadable(() => import('@/components/builder/canvas/collab-canvas').then((m) => m.CollabCanvas))
export const metadata: Metadata = { title: 'Canvas', robots: { index: false } }

// THE E4 CANVAS ROUTE (PROG-E4B), dark. Off (and a 404) unless EDITOR_CANVAS is on, and then staff only. It mounts
// the viewport shell with a shared-doc text editor; the live channel for a real entity is a later slice.
export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ space?: string | string[] }> }) {
  if (!envFlag('EDITOR_CANVAS')) notFound()
  if (!(await getJanitor())) notFound()
  const { space } = await searchParams
  const spaceId = typeof space === 'string' && /^[0-9a-f-]{8,64}$/i.test(space) ? space.toLowerCase() : undefined
  return (
    <AdminPage
      title="Canvas"
      eyebrow="Pages"
      description="The editor canvas on a shared document. Staff preview, switched on with EDITOR_CANVAS."
      width="wide"
    >
      <CollabCanvas spaceId={spaceId} />
    </AdminPage>
  )
}
