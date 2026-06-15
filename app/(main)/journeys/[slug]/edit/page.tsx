import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getPlan } from '@/lib/journey-plans'
import { listPublicPractices } from '@/lib/practices'
import { JourneyEditor, type EditorBlock, type EditorPractice } from '@/components/journey/v2/journey-editor'
import { parseCheck } from '@/lib/journeys/store'
import { JourneySettings } from '@/components/journey/v2/journey-settings'
import { JourneyAdvanced } from '@/components/journey/v2/journey-advanced'

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
    check: parseCheck((i as { settings?: unknown }).settings),
  }))

  const { plan } = loaded
  const practices: EditorPractice[] = (await listPublicPractices()).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
  }))

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <JourneySettings
        planId={plan.id}
        initialTitle={plan.title}
        initialSummary={plan.summary}
        initialIntro={plan.intro}
        initialEmoji={plan.emoji}
        initialAccent={plan.accent}
        initialVisibility={plan.visibility}
        initialStatus={plan.status}
        initialCompletionGems={plan.completion_gems}
        initialCertificateEnabled={plan.certificate_enabled}
        initialDripIntervalDays={plan.drip_interval_days}
      />
      <JourneyEditor slug={slug} title={plan.title} blocks={blocks} practices={practices} />
      <JourneyAdvanced
        planId={plan.id}
        initialPageConfig={plan.page_config}
        initialOfficial={plan.official}
        initialQuestId={plan.quest_id}
        initialWindowStartsAt={plan.window_starts_at}
        initialWindowEndsAt={plan.window_ends_at}
      />
    </div>
  )
}
