import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getPlan } from '@/lib/journey-plans'
import { JourneyEditor, type EditorBlock } from '@/components/journey/v2/journey-editor'

// Journeys v2 — the author-only structure editor route (ADR-252, J4b). Loads the plan's
// block tree and hands it to the client editor. Only the author may open it; everyone else
// is sent to the player. The editor itself calls the author-gated edit actions.
export const dynamic = 'force-dynamic'

export default async function EditJourneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  if (!caller) redirect(`/journeys/${slug}/learn`)

  const loaded = await getPlan(slug)
  if (!loaded) notFound()
  if (loaded.plan.author_id !== caller.id) redirect(`/journeys/${slug}/learn`)

  const blocks: EditorBlock[] = loaded.items.map((i) => ({
    id: i.id,
    parentId: i.parent_id ?? null,
    blockType: i.block_type ?? 'practice',
    title: i.title ?? '',
    body: i.body ?? '',
    sortOrder: i.sort_order ?? 0,
  }))

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <JourneyEditor slug={slug} title={loaded.plan.title} blocks={blocks} />
    </div>
  )
}
