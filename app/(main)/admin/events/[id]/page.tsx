import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { EventEditClient, type TierEditRow } from './event-edit-client'

export const dynamic = 'force-dynamic'

async function loadEvent(id: string) {
  // price_cents isn't in the generated types yet — untyped cast (repo convention).
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data } = await admin
    .from('events')
    .select(
      `id, title, slug, description, location, starts_at, ends_at, is_cancelled, price_cents,
       host:profiles!host_id ( id, display_name, handle ),
       scope:circles!scope_id ( id, name )`,
    )
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

// Ticket tiers for the editor (EVENTS-SYSTEM §2.2). `event_ticket_types` isn't in
// the generated types yet — untyped cast (repo convention). `sold` is read-only here.
async function loadTiers(eventId: string) {
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data } = await admin
    .from('event_ticket_types')
    .select(
      'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, sort_order, active',
    )
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as TierEditRow[]
}

export default async function AdminEventEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdmin('host', { staff: 'community' })

  // Verify the caller can edit this event before rendering the form.
  const [event, caps, tiers] = await Promise.all([loadEvent(id), getEventCapabilities(id), loadTiers(id)])
  if (!event) notFound()
  // Can't edit this event's settings — send them home rather than to a dead end.
  if (!caps.has('event.editSettings')) redirect('/feed')

  // Supabase returns joined rows as arrays; the !fk hint collapses it to a single
  // object at runtime, but the generated types reflect the array shape.
  const host  = (Array.isArray(event.host)  ? event.host[0]  : event.host)  as unknown as { id: string; display_name: string; handle: string } | null | undefined
  const scope = (Array.isArray(event.scope) ? event.scope[0] : event.scope) as unknown as { id: string; name: string } | null | undefined

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Back breadcrumb */}
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-text transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Events
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Edit event</p>
            <h1 className="mt-1 truncate text-xl font-bold text-text">{event.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
              {scope && <span>{scope.name}</span>}
              {host && <span>· Hosted by {host.display_name}</span>}
              {event.is_cancelled && (
                <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">
                  Cancelled
                </span>
              )}
            </div>
          </div>
          <Link
            href={`/events/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors"
          >
            View <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Edit form + cancel/reinstate + ticket tiers */}
      <EventEditClient
        event={{
          id:           event.id,
          title:        event.title,
          slug:         event.slug,
          description:  event.description,
          location:     event.location,
          starts_at:    event.starts_at,
          ends_at:      event.ends_at,
          is_cancelled: event.is_cancelled,
          price_cents:  (event as { price_cents?: number | null }).price_cents ?? null,
        }}
        tiers={tiers}
      />
    </div>
  )
}
