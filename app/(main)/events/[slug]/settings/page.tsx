import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { surfacesFor } from '@/lib/admin/entities/registry'
import { DashboardTemplate } from '@/components/templates'
import { EventManageConsole } from './console'

// The event SETTINGS CONSOLE (ADR-441 EM1-3). The unified registry-driven settings
// surface, rolled onto event from the circle template. It is DISTINCT from the bespoke
// operator dashboard at /events/[slug]/manage (EVENTS-REWORK: roster, approvals,
// questionnaire, dispatches) — so it lives at /events/[slug]/settings and does not
// collide. Pass 1 composes Basics (the event settings module) + Danger (deleteEvent).
//
// SECURITY: a Server Component gated server-side on `event.editSettings` via the one
// resolver (getEventCapabilities → resolveCapabilities). A viewer who cannot manage this
// event gets notFound() — never revealing a private event via the route; every surface's
// mutation re-checks the SAME capability in its server action.

export const metadata: Metadata = {
  title: 'Event settings',
  description: 'Manage your event: its basics and the danger zone.',
}

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: ev } = await admin
    .from('events')
    .select('id, title, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!ev) notFound()

  const caps = await getEventCapabilities(ev.id)
  const surfaces = surfacesFor('event', caps)
  if (surfaces.length === 0) notFound()

  return (
    <DashboardTemplate
      eyebrow="Event settings"
      title={ev.title}
      description="Your event's settings in one place. Changes save as you make them and show up on the event page."
      back={{ href: `/events/${ev.slug}/manage`, label: 'Back to manage' }}
      width="default"
    >
      <EventManageConsole surfaces={surfaces} eventId={ev.id} slug={ev.slug} />
    </DashboardTemplate>
  )
}
