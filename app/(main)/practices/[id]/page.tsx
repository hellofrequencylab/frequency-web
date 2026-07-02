import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Zap, Wand2, Pencil } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getPracticeCapabilities } from '@/lib/core/load-capabilities'
import { getRankedPractice, getPracticeMemberState, getPracticeCreator } from '@/lib/practices'
import { resolvePracticeSlugRedirect } from '@/lib/practices/clean'
import { getPillars, pillarsById } from '@/lib/pillars'
import { DetailTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { PracticeTimerButton } from '@/components/practice/practice-timer-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { ClaimPractice } from '@/components/practice/claim-practice'
import { ProposeToLibraryButton } from '@/components/library/propose-to-library'
import { PracticeAuthor } from '@/components/practice/practice-author'
import { RemixPracticeButton } from '@/components/practice/remix-practice-button'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { UpsellTease } from '@/components/upsell/upsell-tease'
import { resolveTierTeaseGate } from '@/lib/pricing/tease-gate'

export const dynamic = 'force-dynamic'

// The member-facing practice page (ADR-116): the hero image + identity + claim / adopt / log / edit
// actions stay fixed; the BODY (stats · intro · guide · tags · used-in) is module-driven (ADR-270/
// 294) so staff arrange it from Settings → Layout, shared across every /practices/<id> via the
// '/practices/*' scope. The body blocks self-fetch the practice from the URL (lib/practices/
// detail-data); the page keeps the member-state-dependent header here.

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const p = await getRankedPractice(id)
  if (!p) return { title: 'Practice' }
  const desc = p.summary ?? p.description ?? undefined
  const img = p.header_image
  return {
    title: p.title,
    description: desc,
    alternates: { canonical: `/practices/${p.slug ?? p.id}` },
    openGraph: {
      title: p.title,
      description: desc,
      type: 'article',
      ...(img ? { images: [{ url: img }] } : {}),
    },
    twitter: {
      card: img ? 'summary_large_image' : 'summary',
      title: p.title,
      description: desc,
      ...(img ? { images: [img] } : {}),
    },
  }
}

// The body's "How to do it" bullets, for the claim wizard's starting steps.
function parseSteps(body: string | null): string[] {
  if (!body) return []
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean)
    .slice(0, 6)
}

export default async function PracticeDetailPage({ params }: Params) {
  const { id } = await params
  const profileId = await getMyProfileId()
  const practice = await getRankedPractice(id)
  if (!practice) {
    // A slug that no longer matches a live practice may be a merged duplicate's old link
    // (Phase 2 dedup): 301 to the canonical so the old URL + its SEO keep working.
    const canonical = await resolvePracticeSlugRedirect(id)
    if (canonical) permanentRedirect(`/practices/${canonical}`)
    notFound()
  }

  const isOwner = !!profileId && practice.created_by === profileId
  // Public practices are world-readable; a private one is only its owner's.
  if (!practice.is_public && !isOwner) notFound()

  const [pillars, state, creator, practiceCaps] = await Promise.all([
    getPillars(),
    profileId
      ? getPracticeMemberState(profileId, practice.id)
      : Promise.resolve({ adopted: false, loggedToday: false, partialToday: null }),
    getPracticeCreator(practice.created_by),
    getPracticeCapabilities(practice.id),
  ])
  // The Edit-practice affordance opens the in-place Settings drawer. Show it to a
  // manager only — practice.editSettings is exactly the owner / staff / parent-space
  // manager who the settings module itself self-gates on (it never loosens isOwner).
  const canManagePractice = practiceCaps.has('practice.editSettings')
  const pillarName = practice.domain_id ? pillarsById(pillars).get(practice.domain_id)?.name ?? null : null

  const fallback = {
    title: practice.title,
    cadence: practice.cadence ?? 'Daily',
    why: practice.summary ?? practice.description ?? '',
    steps: parseSteps(practice.body),
  }

  const summary = practice.summary ?? practice.description ?? null
  const authorLine = creator?.handle ? <PracticeAuthor creator={creator} prefix="Created by" /> : null

  // Phase E upsell tease gate (ADR-466): when a practice was logged today (the habit just paid off),
  // tease building a Program — ONLY when billing is live AND the caller is below Crew. Dormant while OFF.
  const programsTease = state.loggedToday ? await resolveTierTeaseGate('crew') : null

  return (
    <DetailTemplate
      title={practice.title}
      subtitle={
        summary || authorLine ? (
          <div className="space-y-1.5">
            {summary && <div>{summary}</div>}
            {authorLine}
          </div>
        ) : undefined
      }
      badges={
        <>
          {pillarName && <PillarBadge name={pillarName} />}
          {practice.subcategory && (
            <span className="rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
              {practice.subcategory.name}
            </span>
          )}
          {practice.is_template && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
              <Wand2 className="h-3 w-3" /> Template
            </span>
          )}
        </>
      }
      actions={
        canManagePractice ? (
          <OpenAdminBarButton
            scope={{ kind: 'practice', id: practice.id }}
            caps={Array.from(practiceCaps)}
            label="Edit"
            icon={<Pencil className="h-4 w-4" />}
          />
        ) : undefined
      }
    >
      {practice.header_image && (
        // Plain <img>: topical placeholder host (no next/image remote-host coupling).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={practice.header_image}
          alt=""
          className="mb-5 h-48 w-full rounded-2xl border border-border object-cover sm:h-60"
        />
      )}

      {/* Claim / adopt / log / edit — interactive + member-state dependent, so they stay fixed
          (not a layout block). */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {!profileId ? (
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Zap className="h-4 w-4 fill-on-primary" /> Sign in to claim &amp; earn
          </Link>
        ) : isOwner ? (
          <>
            {/* The plain one-tap log is ONLY for a non-timed practice. A timed practice must be
                logged from its timer (the server refuses a one-tap on it), so it shows ONLY the
                timer button below, never this one. */}
            {!practice.uses_timer && (
              <LogPracticeButton
                practiceId={practice.id}
                initialLogged={state.loggedToday}
                resumeFromSec={state.partialToday?.bankedSec}
                secondsTarget={state.partialToday?.targetSec}
              />
            )}
            {/* A timed practice opens the On Air timer pre-set to this practice + its length
                in place (C.4); a log-only practice has no timer. A partial today resumes it
                ("Continue Practice") instead of starting from zero. */}
            {practice.uses_timer && (
                  <PracticeTimerButton
                    practiceId={practice.id}
                    timerKind={practice.timer_kind}
                    movementMode={practice.movement_config?.mode ?? null}
                    resumeFromSec={state.partialToday?.bankedSec}
                    secondsTarget={state.partialToday?.targetSec}
                  />
                )}
            <ProposeToLibraryButton
              type="practice"
              id={practice.id}
              state={practice.is_public ? 'published' : practice.status === 'pending' ? 'pending' : 'draft'}
            />
          </>
        ) : practice.is_template ? (
          <>
            <ClaimPractice templateId={practice.id} fallback={fallback} />
            <AdoptPracticeButton practiceId={practice.id} adopted={state.adopted} />
            {state.adopted && (
              <>
                {/* The plain one-tap log is ONLY for a non-timed practice; a timed practice is
                    logged from its timer (the server refuses a one-tap on it), so it shows ONLY
                    the timer button below. */}
                {!practice.uses_timer && (
                  <LogPracticeButton
                    practiceId={practice.id}
                    initialLogged={state.loggedToday}
                    resumeFromSec={state.partialToday?.bankedSec}
                    secondsTarget={state.partialToday?.targetSec}
                  />
                )}
                {practice.uses_timer && (
                  <PracticeTimerButton
                    practiceId={practice.id}
                    timerKind={practice.timer_kind}
                    movementMode={practice.movement_config?.mode ?? null}
                    resumeFromSec={state.partialToday?.bankedSec}
                    secondsTarget={state.partialToday?.targetSec}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <>
            <AdoptPracticeButton practiceId={practice.id} adopted={state.adopted} />
            {state.adopted && (
              <>
                {/* The plain one-tap log is ONLY for a non-timed practice; a timed practice is
                    logged from its timer (the server refuses a one-tap on it), so it shows ONLY
                    the timer button below. */}
                {!practice.uses_timer && (
                  <LogPracticeButton
                    practiceId={practice.id}
                    initialLogged={state.loggedToday}
                    resumeFromSec={state.partialToday?.bankedSec}
                    secondsTarget={state.partialToday?.targetSec}
                  />
                )}
                {practice.uses_timer && (
                  <PracticeTimerButton
                    practiceId={practice.id}
                    timerKind={practice.timer_kind}
                    movementMode={practice.movement_config?.mode ?? null}
                    resumeFromSec={state.partialToday?.bankedSec}
                    secondsTarget={state.partialToday?.targetSec}
                  />
                )}
              </>
            )}
            {/* Remix = fork a copy you own (ADR-109). Gated behind a confirm dialog so the
                member knows they're creating a NEW practice, not editing the original. */}
            <RemixPracticeButton practiceId={practice.id} />
          </>
        )}
      </div>

      {/* Phase E upsell tease (ADR-466): logged today — tease turning practices into a Program (a
          guided path others can follow). Shown only at the logged-today success moment, and only when
          billing is live AND the caller is below Crew. DORMANT until billing_live ON. */}
      {programsTease && (
        <UpsellTease
          target="practice-programs"
          live={programsTease.live}
          locked={programsTease.locked}
          href="/upgrade"
          title="Turn your practices into a Program"
          body="Crew lets you build a Program: line up practices into a path others can follow day by day."
          cta="See what Crew adds"
        />
      )}

      {/* The arrangeable body — stats · intro · guide · tags · used-in (Settings → Layout). */}
      <PageModules route={`/practices/${practice.id}`} />
    </DetailTemplate>
  )
}
