import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { contactsOwnerId } from '@/lib/connections/access'
import { getContact } from '@/lib/connections/store'
import { getConnectionSettings } from '@/lib/connections/connection-settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { RelationshipTimeline } from '@/components/people/relationship-timeline'
import { LinkMemberCard } from '@/components/connections/link-member-card'
import { getProfileSummaries } from '@/lib/connections/matching'
import { Detail } from './detail'

export const dynamic = 'force-dynamic'

/** The member this capture was linked to, if any. `linked_profile_id` isn't on the
 *  store's NetworkContact projection, so read it directly here (owner-scoped). */
async function linkedProfileId(ownerId: string, contactId: string): Promise<string | null> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('network_contacts')
    .select('linked_profile_id')
    .eq('id', contactId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  return ((data as { linked_profile_id?: string | null } | null)?.linked_profile_id) ?? null
}

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ownerId = await contactsOwnerId()
  if (!ownerId) redirect('/feed')

  const { id } = await params
  const data = await getContact(ownerId, id)
  if (!data) notFound()

  // If this captured person became a member, show the caller's private shared
  // history with them (gated behind resonance, like the rest of P3). A non-member
  // contact has no Frequency event history, so we skip it entirely.
  const [settings, linkedId] = await Promise.all([
    getConnectionSettings(),
    linkedProfileId(ownerId, id),
  ])
  const timeline =
    settings.resonanceEnabled && linkedId ? (
      <RelationshipTimeline otherId={linkedId} title={`Your history with ${data.contact.displayName ?? 'them'}`} />
    ) : undefined

  // The linked member's public identity (for the On Frequency card), if linked.
  const linked = linkedId ? (await getProfileSummaries([linkedId])).get(linkedId) ?? null : null

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/connections"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Profiles
      </Link>
      <Detail initial={data} timeline={timeline} />
      {/* Manual contact ↔ member link — the path for when the auto detector can't
          fire (card email differs from signup email, no phone on the profile). */}
      <LinkMemberCard contactId={id} contactName={data.contact.displayName} linked={linked} />
    </div>
  )
}
