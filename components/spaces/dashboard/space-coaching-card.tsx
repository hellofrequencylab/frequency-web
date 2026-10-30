import Link from 'next/link'
import { RowCard } from '@/components/cards/row-card'
import { Sparkles } from 'lucide-react'
import { rankSpaceCoachingTask, summarizeCoachingAttendance, type ProfileCoachingEvidence, type SpaceCoachingIdentity } from '@/lib/ai/coaching-evidence'
import { loadSpaceCheckins } from '@/components/frequency/admin/pages/space-reads'
import { getSpaceProfileEvidence } from '@/lib/spaces/analytics'

/** Pure view kept separate so unavailable evidence and the exact action can be verified without DB calls. */
export function SpaceCoachingCardView({ slug, identity, observed }: { slug: string; identity: SpaceCoachingIdentity | null; observed: ProfileCoachingEvidence }) {
  const task = rankSpaceCoachingTask(identity, observed)
  const root = `/spaces/${encodeURIComponent(slug)}`
  const destinations = { identity: `${root}/manage?section=settings`, profile: root, header: `${root}/manage?section=settings#branding-cta-label`, coach: `${root}/settings/coach` }
  return (
    <section aria-label="Your next coaching step">
      <RowCard
        anchor={<Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />}
        title={task.title}
        context="A next step to try"
        meta={<div className="w-full space-y-2">
          <p className="text-body-sm text-text">{task.question}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href={destinations[task.destination]} className="text-body-sm font-semibold text-primary-strong underline underline-offset-4">{task.action}</Link>
            {task.destination !== 'coach' && <Link href={destinations.coach} className="text-meta text-muted underline underline-offset-4">Steer your coach</Link>}
          </div>
        </div>}
        footer={
          <details className="text-2xs text-muted">
            <summary className="cursor-pointer font-medium">Evidence and limits</summary>
            <p className="mt-2">Evidence: {task.confidence}. {task.rationale}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">{task.evidence.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            <p className="mt-2">Read on {new Date(observed.observedThrough).toISOString().slice(0, 10)}. Window starts {new Date(observed.observedFrom).toISOString().slice(0, 10)}.</p>
            <p className="mt-1">Attendance uses the existing dashboard reader, capped at the latest 5,000 Space calendar events and 50,000 check-in records. Large histories can be incomplete. These are records in that read, not proof of all visits or all events hosted elsewhere.</p>
            <p className="mt-1">Views are daily buckets, not unique visitors. Anonymous visits share a daily bucket. Button clicks can repeat and do not prove a completed action. No click-to-person conversion rate is inferred.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">{task.missingData.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            <p className="mt-2">One task is selected by fixed rules: fill a confirmed identity gap first, review recorded attendance, then check measurement and the next action. You write the content. Nothing is sent automatically.</p>
          </details>
        }
      />
    </section>
  )
}

/** Only rendered inside the already-authorized SpaceManageBoard. Aggregates stay inside that Space. */
export async function SpaceCoachingCard({ spaceId, slug, identity }: { spaceId: string; slug: string; identity: SpaceCoachingIdentity | null }) {
  const [observed, checkins] = await Promise.all([getSpaceProfileEvidence(spaceId, 30), loadSpaceCheckins(spaceId)])
  const evidence = { ...observed, attendance: summarizeCoachingAttendance(checkins, Date.parse(observed.observedFrom), Date.parse(observed.observedThrough)) }
  return <SpaceCoachingCardView slug={slug} identity={identity} observed={evidence} />
}
