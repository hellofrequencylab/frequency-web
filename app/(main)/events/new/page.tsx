import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { EventSpark } from '../event-spark'
import type { EventFormInitial } from './event-form'
import { EventEditorWindow } from '@/components/studio/event/event-editor-window'

// Build a prefill from a SOURCE event for the Duplicate flow: clone every field the
// create form sets EXCEPT the date (the new copy defaults to the active day, PART 2) and
// the cover/gallery images (a fresh event starts without inherited media). The title gets
// a plain "(copy)" suffix so the operator can tell the draft apart at a glance. Gated by
// the same `event.editSettings` capability as editing the source, so authz never loosens.
async function buildDuplicateInitial(sourceId: string): Promise<Partial<EventFormInitial> | null> {
  const caps = await getEventCapabilities(sourceId)
  if (!caps.has('event.editSettings')) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'title, description, location, scope_id, scope_type, capacity, visibility, category, energy_tag, ' +
        'attendance_mode, online_url, venue_name, street, city, region, postal_code, country, ' +
        'recurrence_type, recurrence_until',
    )
    .eq('id', sourceId)
    .maybeSingle()
  const src = data as Record<string, unknown> | null
  if (!src) return null

  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const attendanceMode = (['in_person', 'online', 'hybrid'] as const).find(
    (m) => m === src.attendance_mode,
  ) ?? 'in_person'
  const recurrenceType = (['daily', 'weekly', 'monthly'] as const).find((r) => r === src.recurrence_type) ?? 'none'
  const untilIso = typeof src.recurrence_until === 'string' ? src.recurrence_until : ''
  const untilDate = untilIso ? new Date(untilIso) : null
  const recurrenceUntil =
    untilDate && !Number.isNaN(untilDate.getTime())
      ? `${untilDate.getUTCFullYear()}-${String(untilDate.getUTCMonth() + 1).padStart(2, '0')}-${String(untilDate.getUTCDate()).padStart(2, '0')}`
      : ''

  return {
    title: `${str(src.title)} (copy)`.trim(),
    description: str(src.description),
    location: str(src.location),
    // A circle source keeps its circle; a public source leaves scope to the form's default.
    scopeId: src.scope_type === 'circle' ? str(src.scope_id) : undefined,
    capacity: typeof src.capacity === 'number' ? String(src.capacity) : '',
    visibility: str(src.visibility) || 'circle_only',
    category: str(src.category) || 'gathering',
    energyTag: str(src.energy_tag),
    attendanceMode,
    onlineUrl: str(src.online_url),
    venueName: str(src.venue_name),
    street: str(src.street),
    city: str(src.city),
    region: str(src.region),
    postalCode: str(src.postal_code),
    country: str(src.country),
    recurrenceType,
    recurrenceUntil,
    // Date is intentionally omitted so the copy defaults to the active day.
  }
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string; duplicate?: string }>
}) {
  const { circle: circleParam, duplicate: duplicateParam } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  // Paid (Crew/Supporter TIER) or stewards may create events — PB.1/ADR-207.
  const paid = ['crew', 'supporter'].includes((profile as { membership_tier?: string | null }).membership_tier ?? '')
  const steward = ['host', 'guide', 'mentor', 'admin', 'janitor'].includes(profile.community_role ?? '')
  if (!paid && !steward) notFound()

  // Fetch circles the user is a member of (scope for events)
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')

  const circleIds = (memberships ?? []).map((m) => m.circle_id as string)

  let circles: { id: string; name: string }[] = []
  if (circleIds.length > 0) {
    const { data: circleRows } = await admin
      .from('circles')
      .select('id, name')
      .in('id', circleIds)
      .neq('status', 'archived')
      .order('name', { ascending: true })
    circles = (circleRows ?? []) as { id: string; name: string }[]
  }

  // Honor the `?circle=` deep link (the circle-host "New event" affordance), but only when it
  // names a circle the caller actually belongs to — never let the param scope to someone else's.
  const defaultGroupId = circles.some((c) => c.id === circleParam) ? circleParam : undefined

  // Duplicate flow (`?duplicate=<id>`): clone a source event into a prefilled manual form,
  // skipping Vera's wizard. The prefill is null when the source is missing or the viewer
  // lacks edit rights on it (same gate as editing), in which case we fall back to a fresh
  // create rather than leaking anything.
  let duplicateInitial = duplicateParam ? await buildDuplicateInitial(duplicateParam) : null
  // Only keep the cloned circle scope when the viewer can actually pick it in this form
  // (it's one of their listed circles); otherwise drop it so the form falls back to its
  // default rather than holding a circle the select can't show.
  if (duplicateInitial?.scopeId && !circles.some((c) => c.id === duplicateInitial!.scopeId)) {
    duplicateInitial = { ...duplicateInitial, scopeId: undefined }
  }

  return (
    <EventEditorWindow backHref="/events">
      <EventSpark
        groups={circles}
        defaultGroupId={defaultGroupId}
        initial={duplicateInitial ?? undefined}
        startInManual={!!duplicateInitial}
      />
    </EventEditorWindow>
  )
}
