import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Users, UserCheck, Clock, ListChecks } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCapacityInfo } from '@/lib/events/capacity'
import { requireEventManager } from '../../actions'
import { ManageWorkspace, type ManageGuest } from '@/components/events/manage/manage-workspace'

export const dynamic = 'force-dynamic'

type EventMeta = {
  id: string
  title: string
  slug: string
  starts_at: string
  is_cancelled: boolean | null
  price_cents: number | null
}

type RsvpJoinRow = {
  id: string
  status: string
  plus_ones: number | null
  muted: boolean | null
  created_at: string
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

type TicketRow = {
  buyer_profile_id: string | null
  status: string
  amount_cents: number
  qty: number | null
}

// The Manage screen (slice B-3) — a host/cohost/staff operator workspace for one
// event: the RSVP + orders roster (with CSV export), waitlist controls, host-marked
// check-in, and the blast composer. Dashboard template (metric-led). Authorization
// is re-resolved server-side via requireEventManager; anyone else is bounced.
export default async function EventManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: evData } = await (admin as unknown as SupabaseClient)
    .from('events')
    .select('id, title, slug, starts_at, is_cancelled, price_cents')
    .eq('slug', slug)
    .maybeSingle()
  const event = evData as EventMeta | null
  if (!event) notFound()

  // Host / cohost / circle-manager / staff only. Not a manager → back to the event.
  const caller = await requireEventManager(event.id)
  if (!caller) redirect(`/events/${slug}`)

  // ── RSVP roster (muted is newer than the generated types → untyped read) ──────
  const { data: rsvpData } = await (admin as unknown as SupabaseClient)
    .from('event_rsvps')
    .select('id, status, plus_ones, muted, created_at, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })
  const rsvps = ((rsvpData ?? []) as unknown as RsvpJoinRow[]).filter((r) => r.profile != null)

  // ── Orders (paid tickets), keyed by buyer for the roster join ─────────────────
  const isPaid = (event.price_cents ?? 0) > 0
  const ordersByBuyer = new Map<string, { paidCents: number; count: number; refunded: number }>()
  if (isPaid) {
    const { data: ticketData } = await (admin as unknown as SupabaseClient)
      .from('event_tickets')
      .select('buyer_profile_id, status, amount_cents, qty')
      .eq('event_id', event.id)
      .in('status', ['succeeded', 'refunded'])
    for (const t of (ticketData ?? []) as TicketRow[]) {
      if (!t.buyer_profile_id) continue
      const cur = ordersByBuyer.get(t.buyer_profile_id) ?? { paidCents: 0, count: 0, refunded: 0 }
      if (t.status === 'succeeded') {
        cur.paidCents += t.amount_cents
        cur.count += t.qty ?? 1
      } else if (t.status === 'refunded') {
        cur.refunded += t.qty ?? 1
      }
      ordersByBuyer.set(t.buyer_profile_id, cur)
    }
  }

  // ── Who's checked in (the engagement ledger, keyed by the shared idempotency key)
  const checkinKeys = rsvps.map((r) => `event_checkin:${event.id}:${r.profile!.id}`)
  const checkedIn = new Set<string>()
  if (checkinKeys.length) {
    const { data: ledger } = await admin
      .from('engagement_events')
      .select('idempotency_key')
      .in('idempotency_key', checkinKeys)
    for (const row of (ledger ?? []) as { idempotency_key: string }[]) {
      const profileId = row.idempotency_key.split(':')[2]
      if (profileId) checkedIn.add(profileId)
    }
  }

  // Real guests only: someone who withdrew ('not_going') isn't on the roster, the
  // CSV, or a blast target.
  const guests: ManageGuest[] = rsvps
    .filter((r) => r.status !== 'not_going')
    .map((r) => {
    const order = ordersByBuyer.get(r.profile!.id)
    return {
      profileId: r.profile!.id,
      displayName: r.profile!.display_name,
      handle: r.profile!.handle,
      avatarUrl: r.profile!.avatar_url,
      status: r.status as ManageGuest['status'],
      plusOnes: Math.max(0, r.plus_ones ?? 0),
      muted: !!r.muted,
      rsvpedAt: r.created_at,
      checkedIn: checkedIn.has(r.profile!.id),
      paidCents: order?.paidCents ?? 0,
      ticketCount: order?.count ?? 0,
      refundedCount: order?.refunded ?? 0,
    }
  })

  const going = guests.filter((g) => g.status === 'going')
  const waitlist = guests.filter((g) => g.status === 'waitlist')
  const maybe = guests.filter((g) => g.status === 'maybe')
  const checkedInCount = going.filter((g) => g.checkedIn).length
  const plusOnesTotal = going.reduce((s, g) => s + g.plusOnes, 0)

  const capacityInfo = await getCapacityInfo(event.id)
  const capacityLabel = capacityInfo.capacity == null ? 'No cap' : `${capacityInfo.going}/${capacityInfo.capacity}`

  const eventStarted = new Date(event.starts_at) <= new Date()

  return (
    <DashboardTemplate
      eyebrow="Host tools"
      title={event.title}
      description={
        event.is_cancelled
          ? 'This event is cancelled. Guests have been notified (and any paid guests refunded).'
          : 'Your roster, waitlist, check-in, and the blast composer. Only you and your cohosts see this.'
      }
      back={{ href: `/events/${slug}`, label: 'Back to event' }}
      stats={
        <>
          <StatCard label="Going" value={going.length} icon={Users} detail={`${capacityLabel} seats`} />
          <StatCard label="Checked in" value={`${checkedInCount}/${going.length}`} icon={UserCheck} />
          <StatCard label="Waitlist" value={waitlist.length} icon={Clock} />
          <StatCard label="Bringing guests" value={plusOnesTotal} icon={ListChecks} detail={`${maybe.length} maybe`} />
        </>
      }
    >
      <ManageWorkspace
        eventId={event.id}
        slug={slug}
        eventTitle={event.title}
        isPaid={isPaid}
        isCancelled={!!event.is_cancelled}
        eventStarted={eventStarted}
        capacityFull={capacityInfo.isFull}
        guests={guests}
      />
    </DashboardTemplate>
  )
}
