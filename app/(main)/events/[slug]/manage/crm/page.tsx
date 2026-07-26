import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { DashboardTemplate } from '@/components/templates'
import { Skeleton } from '@/components/ui/skeleton'
import { EventMemberViewer } from './event-member-viewer'

// MESSAGE ATTENDEES — the Event CRM surface (CRM Everywhere plan 3.1 / ADR-827). The member
// viewer for ONE event's audience (everyone RSVP'd going or maybe, the owner ruling), a
// subroute of the Manage dashboard. The gate mirrors app/(main)/events/[slug]/manage/page.tsx
// EXACTLY: resolve by slug on the admin client, then 'event.editSettings' (host / cohost /
// staff / parent-scope manager) or a 404 — never a 403, so a private event slug never leaks
// via this route. Rail: falls through to page-chrome's default 'global', same as Manage.
//
// Speed is structural (PAGE-FRAMEWORK §5): the shell renders immediately; the roster read
// streams behind <Suspense>.

export const metadata = {
  title: 'Message Attendees',
}

export default async function MessageAttendeesPage({
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

  const event = ev as { id: string; title: string; slug: string }

  // Gate: only the host, a cohost, or someone who runs the event's circle (the
  // 'event.editSettings' capability) may manage it. 404 (not 403) so a private
  // event slug never leaks via this route.
  const caps = await getEventCapabilities(event.id)
  if (!caps.has('event.editSettings')) notFound()

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title="Message Attendees"
      description={`Everyone who said going or maybe to ${event.title}. Pick a person to see their story and open a direct thread.`}
      back={{ href: `/events/${event.slug}/manage`, label: 'Back to manage' }}
      width="default"
    >
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <EventMemberViewer eventId={event.id} slug={event.slug} />
      </Suspense>
    </DashboardTemplate>
  )
}
