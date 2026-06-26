import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Zap, Pencil, Wand2 } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getPracticeCapabilities } from '@/lib/core/load-capabilities'
import { getRankedPractice, getPracticeMemberState, getPracticeCreator } from '@/lib/practices'
import { getPillars, pillarsById } from '@/lib/pillars'
import { DetailTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { PracticeTimerButton } from '@/components/practice/practice-timer-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { ClaimPractice } from '@/components/practice/claim-practice'
import { StaffEditButton } from '@/components/ui/staff-edit-button'
import { ProposeToLibraryButton } from '@/components/library/propose-to-library'
import { PracticeAuthor } from '@/components/practice/practice-author'
import { RemixPracticeButton } from '@/components/practice/remix-practice-button'
import { EditPracticeButton } from '@/components/practices/edit-practice-button'

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
  return {
    title: p.title,
    description: p.summary ?? p.description ?? undefined,
    alternates: { canonical: `/practices/${p.slug ?? p.id}` },
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
  if (!practice) notFound()

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
      actions={canManagePractice ? <EditPracticeButton /> : undefined}
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
            {/* A PARTIAL today on a TIMED practice belongs on the timer button below (it resumes
                the sit); the plain log button collapses to "Logged today" so we never show two
                "Continue Practice" buttons. A NON-timed partial can't be resumed, so it just
                reads "Logged today". */}
            <LogPracticeButton
              practiceId={practice.id}
              initialLogged={state.loggedToday}
              resumeFromSec={practice.uses_timer ? undefined : state.partialToday?.bankedSec}
              secondsTarget={practice.uses_timer ? undefined : state.partialToday?.targetSec}
            />
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
            <Link
              href={`/practices/${practice.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
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
                {/* A PARTIAL today on a timed practice resumes via the timer button below; the
                    plain log button stays "Logged today" so there's never a double button. */}
                <LogPracticeButton
                  practiceId={practice.id}
                  initialLogged={state.loggedToday}
                  resumeFromSec={practice.uses_timer ? undefined : state.partialToday?.bankedSec}
                  secondsTarget={practice.uses_timer ? undefined : state.partialToday?.targetSec}
                />
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
                {/* A PARTIAL today on a timed practice resumes via the timer button below; the
                    plain log button stays "Logged today" so there's never a double button. */}
                <LogPracticeButton
                  practiceId={practice.id}
                  initialLogged={state.loggedToday}
                  resumeFromSec={practice.uses_timer ? undefined : state.partialToday?.bankedSec}
                  secondsTarget={practice.uses_timer ? undefined : state.partialToday?.targetSec}
                />
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

        {/* Staff (admin/janitor) can edit any practice they don't own. */}
        {!isOwner && <StaffEditButton href={`/practices/${practice.id}/edit`} label="Edit practice" />}
      </div>

      {/* The arrangeable body — stats · intro · guide · tags · used-in (Settings → Layout). */}
      <PageModules route={`/practices/${practice.id}`} />
    </DetailTemplate>
  )
}
