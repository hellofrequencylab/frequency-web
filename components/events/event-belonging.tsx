import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Users, Building2, Route } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Skeleton } from '@/components/ui/skeleton'
import {
  resolveEventBelonging,
  type BelongingKind,
  type BelongingLink,
} from '@/lib/events/belonging'

// "Part of" — the compact strip that says where an Event belongs and lets a member walk there.
//
// An Event can be tied to a Circle, a Space, and a Journey, and until now none of that was
// visible: the Circle showed as a bare unlabeled name and the Journey showed nowhere at all.
// This is the one place those ties render, each as a navigable chip.
//
// WHAT IS NOT HERE, on purpose: the event's raw placement id. `events.scope_id` names an entity
// for exactly one value of `scope_type` (Circle). For a 'public' event it is a shared SENTINEL
// region uuid and for the legacy 'standalone' row it is a PROFILE id, so neither can become a
// link or a "belongs to" claim (ADR-883, which fixed the same mistake on the edit page). The page
// resolves the Circle through `circleScopeId`, so a sentinel can only ever arrive here as null.
//
// The component is async because the Journey tie needs its own read, so the caller mounts it
// inside a <Suspense> with <EventBelongingSkeleton> and the header never waits on it
// (PAGE-FRAMEWORK §5).

const ICON: Record<BelongingKind, typeof Users> = {
  circle: Users,
  space: Building2,
  journey: Route,
}

/** Untyped admin handle: `events.journey_id` is newer than the generated Database types
 *  (ADR-246 escape, the return-type annotation form used by lib/events/placement.ts). */
function untypedAdmin(): SupabaseClient {
  return createAdminClient()
}

/**
 * The Event's Journey, or null. Defensive by contract: `events.journey_id` ships in
 * 20270117000000, so on a database without it PostgREST rejects a select naming the column. A
 * rejected read, a null column, and a Journey row that no longer exists all mean the same thing to
 * a member ("no Journey link"), so all three return null rather than breaking the strip.
 *
 * Not `resolveJourneyRef` (lib/events/placement.ts): that one serves the EDIT page, which is
 * already behind `event.editSettings` and so deliberately carries no visibility. This is a public
 * surface reading through the service-role handle, so it must fetch the Journey's visibility and
 * hand it to `journeyIsLinkable`, which re-applies what `journey_plans` RLS would have said.
 */
async function loadJourneyRef(
  eventId: string,
): Promise<{ title: string | null; slug: string | null; visibility: string | null } | null> {
  const admin = untypedAdmin()

  const { data: ev, error } = await admin
    .from('events')
    .select('journey_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !ev) return null

  const journeyId = (ev as { journey_id?: string | null }).journey_id ?? null
  if (!journeyId) return null

  const { data: plan } = await admin
    .from('journey_plans')
    .select('title, slug, visibility')
    .eq('id', journeyId)
    .maybeSingle()
  const row = plan as { title: string | null; slug: string | null; visibility: string | null } | null
  return row ?? null
}

export async function EventBelonging({
  eventId,
  circle,
  canManage = false,
}: {
  eventId: string
  /** The Circle this Event is placed in, already resolved by the page. Null unless
   *  `scope_type` actually names a Circle. */
  circle: { name: string | null; slug: string | null } | null
  /** Whether the viewer manages this Event. A manager also sees a Journey that is not public yet. */
  canManage?: boolean
}) {
  const journey = await loadJourneyRef(eventId)
  // 🔴 NO SPACE CHIP (ADR-911). This strip used to take a `space` prop the page resolved through
  // `associatedSpaceId`, which returned `hostSpaceId ?? spaceId` — the HOST. So "Part of <Space>"
  // and "Hosted by <Space>" printed the same name on the same screen, and once the two axes were
  // allowed to differ it would have printed the HOST under a label that means placement.
  //
  // The Space now appears exactly once, as the "at <Space>" venue credit on the host line
  // (components/events/venue-credit.tsx). Dropping the prop rather than passing null makes the
  // duplicate impossible to reintroduce by wiring: there is nowhere to put it.
  const links = resolveEventBelonging({ circle, space: null, journey }, { viewerCanManage: canManage })
  if (links.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-subtle">Part of</span>
      {links.map((link) => (
        <BelongingChip key={link.kind} link={link} />
      ))}
    </div>
  )
}

function BelongingChip({ link }: { link: BelongingLink }) {
  const Icon = ICON[link.kind]
  return (
    <Link
      href={link.href}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-xs transition-colors hover:border-border-strong hover:bg-surface"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
      <span className="text-muted">{link.label}</span>
      <span aria-hidden className="text-subtle">
        ·
      </span>
      <span className="truncate font-semibold text-text">{link.name}</span>
    </Link>
  )
}

/** Dimension-matched placeholder for the strip while its Journey read resolves. */
export function EventBelongingSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Skeleton className="h-6 w-32 rounded-full" />
    </div>
  )
}
