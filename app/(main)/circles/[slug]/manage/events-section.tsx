import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import {
  belongsToCircle,
  circleEventScopeFilter,
  type CircleEventRow,
} from '@/lib/events/circle-upcoming'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { attachEventToCircleAction } from './events-actions'

// The circle Manage hub's EVENTS area (the Channel hub's sections.tsx pattern, ADR-870): an async
// Server Component that fetches its own slice so the page streams it behind <Suspense>
// (PAGE-FRAMEWORK §5). The page already authorized the caller as a circle manager
// (resolveEntityConsole non-empty); this only reads, and the add form posts to an action that
// re-checks BOTH authorities (circle.editSettings + event.editSettings, ADR-274).
//
// The PICKER shapes the offer, the action stays the law (ADR-883 §3): it lists only events the
// CALLER manages (getEventCapabilities → event.editSettings), still upcoming, published, not
// cancelled, and not already on this circle. Offering anything wider would be an option the
// server rejects.

const ATTACHABLE_LIMIT = 30

type EligibleEventRow = CircleEventRow & {
  status: string | null
  is_cancelled: boolean | null
  space_id?: string | null
  host_id?: string | null
}

const EVENT_COLUMNS =
  'id, title, slug, location, starts_at, status, is_cancelled, scope_id, scope_type, scope_circle_id, space_id, host_id'

/** Untyped admin handle: the events placement columns are newer than the generated types
 *  (ADR-246 escape: a return-type annotation, not a cast — the repo convention). */
function untyped(): SupabaseClient {
  return createAdminClient()
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** True for a live, still-upcoming event (the only kind worth listing or attaching). */
function isLiveUpcoming(e: EligibleEventRow, cutoff: number): boolean {
  if ((e.status ?? 'published') !== 'published' || e.is_cancelled) return false
  if (!e.starts_at) return false
  const at = new Date(e.starts_at).getTime()
  return Number.isFinite(at) && at >= cutoff
}

/** This circle's upcoming events (creation scope OR live placement), soonest first. */
async function listCircleUpcomingEvents(circleId: string): Promise<EligibleEventRow[]> {
  const filter = circleEventScopeFilter(circleId)
  if (!filter) return []
  const admin = untyped()
  const { data } = await admin
    .from('events')
    .select(EVENT_COLUMNS)
    .or(filter)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(50)
  const rows = (data ?? []) as EligibleEventRow[]
  const cutoff = Date.now()
  return rows.filter((e) => belongsToCircle(e, circleId) && isLiveUpcoming(e, cutoff))
}

/**
 * The events the CALLER may bring onto this circle. Candidates come from the two places the
 * event authority actually lives (events they host + events under a Space they help run, the
 * same owner/admin/editor set getEventCapabilities delegates to) — then EVERY candidate is
 * confirmed through getEventCapabilities itself, so the offer and the gate are one rule.
 */
async function listAttachableEvents(circleId: string): Promise<EligibleEventRow[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  const admin = untyped()
  const nowIso = new Date().toISOString()

  // Spaces the caller helps run (owner or an active admin/editor member — the
  // getSpaceCapabilities().canEditProfile set getEventCapabilities asks about).
  const spaceIds = new Set<string>()
  const { data: owned } = await admin.from('spaces').select('id').eq('owner_profile_id', profileId)
  for (const s of (owned ?? []) as Array<{ id: string }>) spaceIds.add(s.id)
  const { data: memberships } = await admin
    .from('space_members')
    .select('space_id')
    .eq('profile_id', profileId)
    .in('role', ['admin', 'editor'])
    .eq('status', 'active')
  for (const m of (memberships ?? []) as Array<{ space_id: string }>) spaceIds.add(m.space_id)

  const [{ data: hosted }, spaceRes] = await Promise.all([
    admin
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('host_id', profileId)
      .eq('status', 'published')
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(ATTACHABLE_LIMIT),
    spaceIds.size > 0
      ? admin
          .from('events')
          .select(EVENT_COLUMNS)
          .in('space_id', [...spaceIds])
          .eq('status', 'published')
          .gte('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(ATTACHABLE_LIMIT)
      : Promise.resolve({ data: [] }),
  ])

  const byId = new Map<string, EligibleEventRow>()
  for (const row of [...((hosted ?? []) as EligibleEventRow[]), ...((spaceRes.data ?? []) as EligibleEventRow[])]) {
    byId.set(row.id, row)
  }

  const cutoff = Date.now()
  const candidates = [...byId.values()]
    .filter((e) => isLiveUpcoming(e, cutoff) && !belongsToCircle(e, circleId))
    .sort((a, b) => new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime())
    .slice(0, ATTACHABLE_LIMIT)

  // THE AUTHORITY CONFIRMS THE OFFER: only events the caller genuinely manages
  // (event.editSettings — the exact capability the action re-checks) make the list.
  const confirmed: EligibleEventRow[] = []
  for (const e of candidates) {
    const caps = await getEventCapabilities(e.id)
    if (caps.has('event.editSettings')) confirmed.push(e)
  }
  return confirmed
}

export async function CircleEventsSection({
  circleId,
  slug,
  notice,
}: {
  circleId: string
  slug: string
  notice?: { saved?: boolean; error?: string }
}) {
  const [upcoming, attachable] = await Promise.all([
    listCircleUpcomingEvents(circleId),
    listAttachableEvents(circleId),
  ])

  const banner = notice?.error ? (
    <p className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-2.5 text-body-sm text-danger">
      {notice.error === 'missing'
        ? 'Pick an event first.'
        : notice.error === 'denied'
          ? 'You are not allowed to do that.'
          : notice.error === 'already'
            ? 'That event is already on this circle.'
            : notice.error === 'ineligible'
              ? 'Only an upcoming event that is live and not cancelled can come onto the circle.'
              : 'That did not save. Try again.'}
    </p>
  ) : notice?.saved ? (
    <p className="rounded-xl border border-success/30 bg-success-bg px-4 py-2.5 text-body-sm text-success">
      Saved.
    </p>
  ) : null

  // Add an event this manager already runs (the owner ask). The picker only offers what the
  // action's gates admit; the action re-checks both authorities on submit.
  const addForm = (
    <div className="rounded-card border border-border bg-surface p-5 lift-1">
      <SectionHeader title="Add an event" />
      <p className="mb-3 text-body-sm text-muted">
        Bring an event you already run onto this circle. It shows on the circle page, and your
        members can find and RSVP to it there.
      </p>
      {attachable.length === 0 ? (
        <p className="text-body-sm text-subtle">
          No events to add right now. Upcoming events you manage that are not already here will
          show in this list.
        </p>
      ) : (
        <form action={attachEventToCircleAction.bind(null, circleId, slug)} className="space-y-3">
          <label className="block space-y-1">
            <span className={labelClasses}>Event</span>
            <Select name="eventId" required defaultValue="">
              <option value="" disabled>
                Pick an event
              </option>
              {attachable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                  {e.starts_at ? ` · ${fmtWhen(e.starts_at)}` : ''}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" size="sm">
            Add to circle
          </Button>
        </form>
      )}
      <div className="mt-4 border-t border-border pt-4">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/events/new?circle=${circleId}`}>
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> New event for this circle
          </Link>
        </Button>
      </div>
    </div>
  )

  if (upcoming.length === 0) {
    return (
      <div className="space-y-5">
        {banner}
        <EmptyState
          variant="first-use"
          title="No upcoming events yet"
          description="When this circle has an event coming up, it lands here. Add one you already run below, or create a new one."
        />
        {addForm}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {banner}
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {upcoming.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link href={`/events/${e.slug}`} className="block truncate font-medium text-text hover:underline">
                {e.title}
              </Link>
              {e.location && <span className="block truncate text-meta text-subtle">{e.location}</span>}
            </div>
            {e.starts_at && (
              <span className="shrink-0 text-meta text-subtle">{fmtWhen(e.starts_at)}</span>
            )}
          </li>
        ))}
      </ul>
      {addForm}
    </div>
  )
}
