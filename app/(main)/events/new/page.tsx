import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getEventCapabilities, getCircleCapabilities } from '@/lib/core/load-capabilities'
import { EventSpark } from '../event-spark'
import { getViewerHome } from '../admin-actions'
import type { EventFormInitial } from './event-form'
import { EventEditorWindow } from '@/components/studio/event/event-editor-window'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { listLinkableJourneys, resolveJourneyRef } from '@/lib/events/placement'
import { canEditJourney } from '@/lib/journeys/authoring'

// Build a prefill from a SOURCE event for the Duplicate flow: clone every field the
// create form sets EXCEPT the date (the new copy defaults to the active day, PART 2) and
// the cover/gallery images (a fresh event starts without inherited media). The title gets
// a plain "(copy)" suffix so the operator can tell the draft apart at a glance. Gated by
// the same `event.editSettings` capability as editing the source, so authz never loosens.
/** The form prefill PLUS the source's Space. `spaceId` is returned beside the prefill rather than
 *  inside it because it is not a form field — it feeds `defaultGroupId`, the scope selector's
 *  default. Putting it in EventFormInitial would imply the form renders it. */
interface DuplicatePrefill {
  initial: Partial<EventFormInitial>
  spaceId?: string
}

async function buildDuplicateInitial(sourceId: string): Promise<DuplicatePrefill | null> {
  const caps = await getEventCapabilities(sourceId)
  if (!caps.has('event.editSettings')) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'title, description, location, scope_id, scope_type, capacity, visibility, category, energy_tag, ' +
        'attendance_mode, online_url, venue_name, street, city, region, postal_code, country, ' +
        // space_id carries the SPACE the source event belongs to. Without it, duplicating from a
        // Space's Calendar console produced a root-attributed personal event: the Duplicate link is
        // `/events/new?duplicate=<id>` with no `?space=`, so defaultGroupId below had nothing to
        // resolve. That is precisely the failure the comment on defaultGroupId calls "the Royal
        // Temple bug", reproduced by a different entry point.
        'space_id, ' +
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
    spaceId: str(src.space_id) || undefined,
    initial: {
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
    },
  }
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string; space?: string; duplicate?: string; journey?: string }>
}) {
  const {
    circle: circleParam,
    space: spaceParam,
    duplicate: duplicateParam,
    journey: journeyParam,
  } = await searchParams
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

  // Event creation is open to any signed-in member (ADR-810): it is the freemium taste. The paid funnel
  // lives downstream (co-hosting an event with another space needs a Business space; ADR-799 §B). The
  // create action re-validates the caller + per-target stewardship server-side.

  // WHERE DOES IT LIVE — only the targets the caller actually OWNS/stewards (an owned target
  // places instantly, so it must be one they control; never "circles I'm merely a member of").
  // The server re-validates ownership again in createEvent, so this list is a convenience only.

  // Circles the caller HOSTS (host_id = them). space_id rides along so the option label can say
  // when a circle's event will land on a Space calendar too (ADR-857).
  const { data: hostedCircles } = await admin
    .from('circles')
    .select('id, name, space_id')
    .eq('host_id', profile.id)
    .neq('status', 'archived')
    .order('name', { ascending: true })
  const circles = (hostedCircles ?? []) as { id: string; name: string; space_id: string | null }[]

  // A `?circle=` deep link (the circle rail's "New event", the circle header Create menu, the
  // context actions) can name a Circle the caller RUNS without being its `host_id` row — a guide
  // or mentor over its hub/nexus, a stewardship-edge host, an operator. The host_id query above
  // cannot see those, so the link used to fall through to a personal public event with no notice
  // (the Royal Temple bug, in its circle form). Re-resolve a link that missed through the ONE
  // circle authority (circle.editSettings, exactly what createEvent now re-checks) and offer it.
  if (circleParam && !circles.some((c) => c.id === circleParam)) {
    const { data: linked } = await admin
      .from('circles')
      .select('id, name, space_id')
      .eq('id', circleParam)
      .neq('status', 'archived')
      .maybeSingle()
    const linkedCircle = linked as { id: string; name: string; space_id: string | null } | null
    if (linkedCircle && (await getCircleCapabilities(linkedCircle.id)).has('circle.editSettings')) {
      circles.push(linkedCircle)
      circles.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

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

  // Editor+ managers create events too — the Calendar console that links here is gated at
  // editor (lib/spaces/functions.ts events defaultMinRole), so the list must match or the
  // console's own "New event" affordance silently loses the space (the Royal Temple bug:
  // the dropped ?space= fell through to a public root-attributed event).
  const { data: managerMemberships } = await admin
    .from('space_members')
    .select('space_id')
    .eq('profile_id', profile.id)
    .in('role', ['editor', 'moderator', 'admin'])
    .eq('status', 'active')
  const managerSpaceIds = ((managerMemberships ?? []) as { space_id: string }[])
    .map((m) => m.space_id)
    .filter((id) => !spaceById.has(id))
  if (managerSpaceIds.length > 0) {
    const { data: managerSpaces } = await admin
      .from('spaces')
      .select('id, name, brand_name')
      .in('id', managerSpaceIds)
    for (const s of (managerSpaces ?? []) as { id: string; name: string | null; brand_name: string | null }[]) {
      spaceById.set(s.id, spaceName(s))
    }
  }
  const spaces = [...spaceById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // A circle that lives in a Space places its events on that Space's calendar too (ADR-857) —
  // say so in the option label, or the dual placement is invisible at the exact moment the host
  // chooses it. Root = a personal circle, which keeps the plain label. Batched name lookup for
  // owning spaces the caller does NOT run (a hosted circle can live in someone else's Space).
  const root = await loadRootSpaceId()
  const owningSpaceIds = [
    ...new Set(
      circles
        .map((c) => c.space_id)
        .filter((sid): sid is string => !!sid && sid !== root && !spaceById.has(sid)),
    ),
  ]
  if (owningSpaceIds.length > 0) {
    const { data: owningSpaces } = await admin
      .from('spaces')
      .select('id, name, brand_name')
      .in('id', owningSpaceIds)
    for (const s of (owningSpaces ?? []) as { id: string; name: string | null; brand_name: string | null }[]) {
      spaceById.set(s.id, spaceName(s))
    }
  }
  const circleLabel = (c: { name: string; space_id: string | null }) => {
    const owner = c.space_id && c.space_id !== root ? spaceById.get(c.space_id) : null
    return owner ? `In ${c.name} (circle in ${owner})` : `In ${c.name} (circle you host)`
  }

  // WHICH JOURNEY CAN IT BE PART OF — a different question from "where does it live", and answered
  // by a different authority. A Journey link is an ASSOCIATION (events.journey_id, beside space_id),
  // so it never becomes the event's home; the picker therefore offers Journeys by the rule that
  // governs Journeys, not the rule that governs placement:
  //
  //   • Journeys the caller AUTHORED, plus Journeys owned by a Space they manage (owner / admin /
  //     editor — team authoring). That is exactly the set `canEditJourney` admits, which is what
  //     createEvent re-checks on submit. ADR-883's third defect was an offer wider or narrower than
  //     the gate behind it; here the list and the gate read the same rule.
  //   • NOT "Journeys I am enrolled in" or "public Journeys". Being on someone's Journey is not
  //     authority over it, and linking is the Journey's business: an open picker would let any
  //     member hang their event off the community's flagship Journey.
  //
  // A platform operator passes `canEditJourney` on every Journey in the library, which is not a
  // list worth rendering, so the deep link below re-resolves through the real authority instead —
  // the same shape as the `?circle=` re-resolve above.
  const journeys = await listLinkableJourneys(profile.id, root)
  let defaultJourneyId: string | undefined
  if (journeyParam) {
    if (journeys.some((j) => j.id === journeyParam)) {
      defaultJourneyId = journeyParam
    } else if (await canEditJourney(journeyParam, profile.id)) {
      const linked = await resolveJourneyRef(journeyParam)
      if (linked) {
        journeys.push(linked)
        defaultJourneyId = linked.id
      }
    }
  }
  journeys.sort((a, b) => a.title.localeCompare(b.title))
  const journeyOptions = journeys.map((j) => ({ id: j.id, title: j.title }))

  // Grouped, labeled scope options for the form: circles you host, then spaces you run. `kind`
  // lets the form encode each option's target type without a second lookup on submit.
  const scopeOptions = [
    ...circles.map((c) => ({ id: c.id, name: c.name, kind: 'circle' as const, label: circleLabel(c) })),
    ...spaces.map((s) => ({ id: s.id, name: s.name, kind: 'space' as const, label: `In ${s.name} (space you run)` })),
  ]

  // Duplicate flow (`?duplicate=<id>`): clone a source event into a prefilled manual form,
  // skipping Vera's wizard. The prefill is null when the source is missing or the viewer
  // lacks edit rights on it (same gate as editing), in which case we fall back to a fresh
  // create rather than leaking anything.
  let duplicateInitial = duplicateParam ? await buildDuplicateInitial(duplicateParam) : null
  // Only keep the cloned circle scope when the viewer can actually pick it in this form
  // (it's one of the circles they host); otherwise drop it so the form falls back to its
  // default rather than holding a circle the select can't show.
  if (
    duplicateInitial?.initial.scopeId &&
    !circles.some((c) => c.id === duplicateInitial!.initial.scopeId)
  ) {
    duplicateInitial = {
      ...duplicateInitial,
      initial: { ...duplicateInitial.initial, scopeId: undefined },
    }
  }

  // Honor a scope deep link — `?circle=` (the circle-host affordance) or `?space=` (the space
  // Calendar console "New event" affordance) — but only when it names a scope the caller actually
  // helps run (a circle they host or a space where they are editor+), never letting the param scope
  // to someone else's. `?space=` wins when both are present since it is the more specific console
  // entry point. A param that FAILS the check is surfaced (droppedSpaceLink below), never silently
  // swallowed — a silent drop is how a Business Space's event ended up root-attributed + personal.
  //
  // A DUPLICATE inherits its source's Space when the caller runs that Space. Ranked BELOW an
  // explicit `?space=` (an operator who deep-linked from a console meant that one) and ABOVE
  // `?circle=`, matching the same most-specific-wins order. Without this, Duplicate dropped the
  // Space entirely — the Duplicate link carries no `?space=`, so a copy of a Business Space's
  // event was created as a root-attributed personal event. Re-checked against `spaces` here, so
  // duplicating someone else's event can never place the copy in their Space.
  const duplicateSpaceId =
    duplicateInitial?.spaceId && spaces.some((sp) => sp.id === duplicateInitial!.spaceId)
      ? duplicateInitial.spaceId
      : undefined

  const defaultGroupId = spaces.some((s) => s.id === spaceParam)
    ? spaceParam
    : duplicateSpaceId
      ? duplicateSpaceId
      : circles.some((c) => c.id === circleParam)
        ? circleParam
        : undefined

  // The viewer's saved home, to DEFAULT the venue autocomplete's location bias before any
  // pin exists (local-first address search — people almost always post events near home).
  // Null for a viewer with no saved home; the device's own geolocation still wins when granted.
  const viewerHome = await getViewerHome()

  // The deep link named a space the caller does not help run (or that does not exist). Say so
  // instead of quietly building a personal public event they thought was the space's.
  const droppedSpaceLink = !!spaceParam && !spaces.some((s) => s.id === spaceParam)
  // Same honesty for a `?circle=` link that survived neither the hosted list nor the capability
  // re-resolve above: the event below will be personal, and the host should hear it here. Silent
  // when a valid `?space=` already claimed the scope, so the two notices never contradict.
  const droppedCircleLink =
    !!circleParam && !circles.some((c) => c.id === circleParam) && !defaultGroupId
  // And for a `?journey=` link that neither the authored/team list nor the capability re-resolve
  // could honor. The event still gets created; it just will not be part of that Journey, and the
  // host hears it here rather than discovering the missing link on the Journey later.
  const droppedJourneyLink = !!journeyParam && !defaultJourneyId

  // The manual form's prefill. A `?journey=` deep link seeds the Journey field the same way
  // `?circle=` seeds the scope; a Duplicate prefill keeps everything it already carried.
  const formInitial: Partial<EventFormInitial> | undefined =
    duplicateInitial || defaultJourneyId
      ? {
          ...(duplicateInitial?.initial ?? {}),
          ...(defaultJourneyId ? { journeyId: defaultJourneyId } : {}),
        }
      : undefined

  return (
    <EventEditorWindow backHref="/events">
      {droppedSpaceLink && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/30 px-4 py-3 text-body-sm leading-relaxed text-text">
          You opened this from a space you do not help run, so the event below will be a personal
          event. To create it for the space, ask its owner to make you an editor first.
        </p>
      )}
      {droppedCircleLink && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/30 px-4 py-3 text-body-sm leading-relaxed text-text">
          You opened this from a Circle you do not run, so the event below will be a personal
          event. To create it for the Circle, ask its host to add it for you.
        </p>
      )}
      {droppedJourneyLink && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/30 px-4 py-3 text-body-sm leading-relaxed text-text">
          You opened this from a Journey you do not run, so the event below will not be part of it.
          To add it to the Journey, ask whoever runs the Journey to link it.
        </p>
      )}
      <EventSpark
        groups={scopeOptions}
        journeys={journeyOptions}
        defaultGroupId={defaultGroupId}
        initial={formInitial}
        startInManual={!!duplicateInitial}
        home={viewerHome}
      />
    </EventEditorWindow>
  )
}
