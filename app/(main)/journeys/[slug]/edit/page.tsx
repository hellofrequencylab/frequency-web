import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { getPlan, getVeraReview } from '@/lib/journey-plans'
import { listPublicPractices } from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { JourneyEditor, type EditorBlock, type EditorPractice, type EditorPillar } from '@/components/journey/v2/journey-editor'
import { parseCheck } from '@/lib/journeys/store'
import { JourneySettings } from '@/components/journey/v2/journey-settings'
import { JourneyAdvanced } from '@/components/journey/v2/journey-advanced'
import { JourneyBuilder } from '@/components/journey/v2/journey-builder'
import { JourneyComposer } from '@/components/journey/v2/journey-composer'
import { JourneyDangerZone } from '@/components/journey/v2/journey-danger-zone'

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
  // The author, or an operator (admin.access) managing any Journey in the library.
  if (loaded.plan.author_id !== caller.id && !(await getGlobalCapabilities()).has('admin.access')) {
    redirect(`/journeys/${slug}/learn`)
  }

  const blocks: EditorBlock[] = loaded.items.map((i) => {
    const settings = (i as { settings?: Record<string, unknown> | null }).settings
    const cp = settings?.coaching_prompt
    const extraCredit = settings?.extra_credit === true
    const bonusZaps = settings && typeof settings.bonus_zaps === 'number' ? settings.bonus_zaps : 0
    return {
      id: i.id,
      parentId: i.parent_id ?? null,
      blockType: i.block_type ?? 'practice',
      title: i.title ?? '',
      body: i.body ?? '',
      sortOrder: i.sort_order ?? 0,
      check: parseCheck(settings),
      domainId: i.domain_id ?? null,
      coachingPrompt: typeof cp === 'string' ? cp : null,
      extraCredit,
      bonusZaps,
    }
  })

  const { plan } = loaded
  const [practicesRaw, veraReview, pillarsRaw] = await Promise.all([
    listPublicPractices(),
    getVeraReview(plan.id),
    getPillars(),
  ])
  const practices: EditorPractice[] = practicesRaw.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    pillarId: p.domain_id,
  }))
  const pillars: EditorPillar[] = pillarsRaw.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))

  return (
    <JourneyBuilder
      slug={slug}
      planId={plan.id}
      status={plan.status}
      initialTitle={plan.title}
      initialSummary={plan.summary}
      initialCover={plan.cover_image}
      initialEmoji={plan.emoji}
      initialAccent={plan.accent}
      initialIntro={plan.intro}
      vera={<JourneyComposer slug={slug} isEmpty={blocks.length === 0} />}
      curriculum={<JourneyEditor slug={slug} blocks={blocks} practices={practices} pillars={pillars} />}
      settings={
        <div className="space-y-6">
          <JourneySettings
            hideIdentity
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
            initialCoverImage={plan.cover_image}
            initialReview={veraReview}
            initialDifficulty={(plan as unknown as { difficulty?: string | null }).difficulty ?? null}
            initialCategory={(plan as unknown as { category?: string | null }).category ?? null}
            initialTags={(plan as unknown as { tags?: string[] }).tags ?? []}
            initialDailyMinutes={(plan as unknown as { daily_minutes?: number | null }).daily_minutes ?? null}
            initialEnrollCap={(plan as unknown as { enroll_cap?: number | null }).enroll_cap ?? null}
          />
          {/* Advanced — discovery layout + official program, with the delete control tucked in
              its footer (ADR-301: "put delete in the advanced box"). */}
          <JourneyAdvanced
            planId={plan.id}
            initialPageConfig={plan.page_config}
            initialOfficial={plan.official}
            initialQuestId={plan.quest_id}
            initialWindowStartsAt={plan.window_starts_at}
            initialWindowEndsAt={plan.window_ends_at}
            footer={<JourneyDangerZone planId={plan.id} title={plan.title} />}
          />
        </div>
      }
    />
  )
}
