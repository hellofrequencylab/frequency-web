import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { EventSpark } from '../event-spark'
import { getViewerHome } from '../admin-actions'
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
        'recurrence_type, recurrence_until, price_cents',
    )
    .eq('id', sourceId)
    .maybeSingle()
  const src = data as unknown as Record<string, unknown> | null
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
    // Carry the ticket price forward (0/absent = a free RSVP event).
    priceCents: typeof src.price_cents === 'number' ? src.price_cents : undefined,
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

  // WHERE DOES IT LIVE — only the targets the caller actually OWNS/stewards (an owned target
  // places instantly, so it must be one they control; never "circles I'm merely a member of").
  // The server re-validates ownership again in createEvent, so this list is a convenience only.

  // Circles the caller HOSTS (host_id = them).
  const { data: hostedCircles } = await admin
    .from('circles')
    .select('id, name')
    .eq('host_id', profile.id)
    .neq('status', 'archived')
    .order('name', { ascending: true })
  const circles = (hostedCircles ?? []) as { id: string; name: string }[]

  // Spaces the caller RUNS: the owner, plus any space where they are an ACTIVE admin member.
  const { data: ownedSpaces } = await admin
    .from('spaces')
    .select('id, name, brand_name')
    .eq('owner_profile_id', profile.id)
  const spaceName = (s: { name: string | null; brand_name: string | null }) =>
    s.brand_name ?? s.name ?? 'Space'
  const spaceById = new Map<string, string>()
  for (const s of (ownedSpaces ?? []) as { id: string; name: string | null; brand_name: string | null }[]) {
    spaceById.set(s.id, spaceName(s))
  }

  const { data: adminMemberships } = await admin
    .from('space_members')
    .select('space_id')
    .eq('profile_id', profile.id)
    .eq('role', 'admin')
    .eq('status', 'active')
  const adminSpaceIds = ((adminMemberships ?? []) as { space_id: string }[])
    .map((m) => m.space_id)
    .filter((id) => !spaceById.has(id))
  if (adminSpaceIds.length > 0) {
    const { data: adminSpaces } = await admin
      .from('spaces')
      .select('id, name, brand_name')
      .in('id', adminSpaceIds)
    for (const s of (adminSpaces ?? []) as { id: string; name: string | null; brand_name: string | null }[]) {
      spaceById.set(s.id, spaceName(s))
    }
  }
  const spaces = [...spaceById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Grouped, labeled scope options for the form: circles you host, then spaces you run. `kind`
  // lets the form encode each option's target type without a second lookup on submit.
  const scopeOptions = [
    ...circles.map((c) => ({ id: c.id, name: c.name, kind: 'circle' as const, label: `In ${c.name} (circle you host)` })),
    ...spaces.map((s) => ({ id: s.id, name: s.name, kind: 'space' as const, label: `In ${s.name} (space you run)` })),
  ]

  // Honor the `?circle=` deep link (the circle-host "New event" affordance), but only when it
  // names a circle the caller actually HOSTS — never let the param scope to someone else's.
  const defaultGroupId = circles.some((c) => c.id === circleParam) ? circleParam : undefined

  // Duplicate flow (`?duplicate=<id>`): clone a source event into a prefilled manual form,
  // skipping Vera's wizard. The prefill is null when the source is missing or the viewer
  // lacks edit rights on it (same gate as editing), in which case we fall back to a fresh
  // create rather than leaking anything.
  let duplicateInitial = duplicateParam ? await buildDuplicateInitial(duplicateParam) : null
  // Only keep the cloned circle scope when the viewer can actually pick it in this form
  // (it's one of the circles they host); otherwise drop it so the form falls back to its
  // default rather than holding a circle the select can't show.
  if (duplicateInitial?.scopeId && !circles.some((c) => c.id === duplicateInitial!.scopeId)) {
    duplicateInitial = { ...duplicateInitial, scopeId: undefined }
  }

  // The viewer's saved home, to DEFAULT the venue autocomplete's location bias before any
  // pin exists (local-first address search — people almost always post events near home).
  // Null for a viewer with no saved home; the device's own geolocation still wins when granted.
  const viewerHome = await getViewerHome()

  return (
    <EventEditorWindow backHref="/events">
      <EventSpark
        groups={scopeOptions}
        defaultGroupId={defaultGroupId}
        initial={duplicateInitial ?? undefined}
        startInManual={!!duplicateInitial}
        home={viewerHome}
      />
    </EventEditorWindow>
  )
}
