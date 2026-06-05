import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Zap, Users, Flame, Pencil, Repeat, Wand2, type LucideIcon } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getRankedPractice, getPracticeMemberState } from '@/lib/practices'
import { getPillars, pillarsById } from '@/lib/pillars'
import { DetailTemplate } from '@/components/templates'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { ClaimPractice } from '@/components/practice/claim-practice'
import { StaffEditButton } from '@/components/ui/staff-edit-button'
import { forkPracticeAction } from '../actions'

export const dynamic = 'force-dynamic'

// The member-facing practice page (ADR-116): the hero image, the full write-up,
// the stats (reward · cadence · who's practising · times logged), and the claim /
// adopt / log / edit actions. This is where a library TEMPLATE becomes something
// you get excited to claim and make your own.

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const p = await getRankedPractice(id)
  if (!p) return { title: 'Practice' }
  return { title: p.title, description: p.summary ?? p.description ?? undefined }
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

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-warning">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-sm font-bold text-text">{value}</span>
      </div>
      <p className="mt-0.5 text-xs text-subtle">{label}</p>
    </div>
  )
}

export default async function PracticeDetailPage({ params }: Params) {
  const { id } = await params
  const profileId = await getMyProfileId()
  const practice = await getRankedPractice(id)
  if (!practice) notFound()

  const isOwner = !!profileId && practice.created_by === profileId
  // Public practices are world-readable; a private one is only its owner's.
  if (!practice.is_public && !isOwner) notFound()

  const [pillars, state] = await Promise.all([
    getPillars(),
    profileId
      ? getPracticeMemberState(profileId, practice.id)
      : Promise.resolve({ adopted: false, loggedToday: false }),
  ])
  const pillarName = practice.domain_id ? pillarsById(pillars).get(practice.domain_id)?.name ?? null : null

  const fallback = {
    title: practice.title,
    cadence: practice.cadence ?? 'Daily',
    why: practice.summary ?? practice.description ?? '',
    steps: parseSteps(practice.body),
  }

  return (
    <DetailTemplate
      title={practice.title}
      subtitle={practice.summary ?? practice.description ?? undefined}
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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Zap} value={practice.reward_note ?? `+${practice.reward_zaps ?? 12} zaps`} label="Reward per log" />
        <Stat icon={Repeat} value={practice.cadence ?? 'Your call'} label="Cadence" />
        <Stat icon={Users} value={practice.adopters} label="Practising now" />
        <Stat icon={Flame} value={practice.logs_total} label="Times logged" />
      </div>

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
            <LogPracticeButton practiceId={practice.id} />
            <Link
              href={`/practices/${practice.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </>
        ) : practice.is_template ? (
          <>
            <ClaimPractice templateId={practice.id} fallback={fallback} />
            <AdoptPracticeButton practiceId={practice.id} adopted={state.adopted} />
            {state.adopted && <LogPracticeButton practiceId={practice.id} />}
          </>
        ) : (
          <>
            <AdoptPracticeButton practiceId={practice.id} adopted={state.adopted} />
            {state.adopted && <LogPracticeButton practiceId={practice.id} />}
            <form action={forkPracticeAction.bind(null, practice.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                <Wand2 className="h-3.5 w-3.5" /> Customize
              </button>
            </form>
          </>
        )}

        {/* Staff (admin/janitor) can edit any practice they don't own. */}
        {!isOwner && <StaffEditButton href={`/practices/${practice.id}/edit`} label="Edit practice" />}
      </div>

      {practice.body && <HelpMarkdown>{practice.body}</HelpMarkdown>}

      {practice.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5 border-t border-border pt-4">
          {practice.tags.map((t) => (
            <span key={t.slug} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-subtle">
              #{t.label}
            </span>
          ))}
        </div>
      )}
    </DetailTemplate>
  )
}
