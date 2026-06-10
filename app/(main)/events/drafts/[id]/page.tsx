import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { getMyDraft } from '@/lib/events/event-drafts'
import { detailsMediaPaths, type EventDetailsWithMedia } from '@/lib/events/details-media'
import { posterSignedUrlMap } from '@/lib/events/poster-media'
import { DraftEditor } from './editor'
import { OutreachCard } from './outreach-card'

export const dynamic = 'force-dynamic'

// The draft editor for a captured poster event — owner-scoped (getMyDraft reads
// only the caller's own rows; anyone else 404s). Once published, the page turns
// into a small status surface: a link to the live event plus the outreach
// prompt while a posted event stays unclaimed.
export default async function DraftEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/events/drafts/${id}`)

  const draft = await getMyDraft(profileId, id)
  if (!draft) notFound()

  // Sign every crop the editor previews (one batched storage call).
  const details = draft.details as EventDetailsWithMedia
  const paths = [...detailsMediaPaths(details), ...(draft.posterPath ? [draft.posterPath] : [])]
  const signedUrls = Object.fromEntries(await posterSignedUrlMap(paths))

  if (draft.status === 'published') {
    return (
      <FocusTemplate
        title={draft.title ?? 'Your event'}
        description="This one is already live."
        back={{ href: '/events/drafts', label: 'My drafts' }}
      >
        <div className="space-y-4">
          {draft.claimToken && !draft.claimedAt && draft.slug && (
            <OutreachCard claimToken={draft.claimToken} slug={draft.slug} />
          )}
          {draft.slug && (
            <Link
              href={`/events/${draft.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              View the event <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </FocusTemplate>
    )
  }

  // The pillar select needs the slug, not the id (drafts store domain_id).
  let domainSlug = ''
  if (draft.domainId) {
    const { data } = await (createAdminClient() as unknown as SupabaseClient)
      .from('pillars')
      .select('slug')
      .eq('id', draft.domainId)
      .maybeSingle()
    domainSlug = (data as { slug?: string } | null)?.slug ?? ''
  }

  return (
    <FocusTemplate
      title="Tidy your event draft"
      description="Fix anything the poster got fuzzy, then publish it to local events."
      back={{ href: '/events/drafts', label: 'My drafts' }}
    >
      <DraftEditor
        draft={{
          id: draft.id,
          title: draft.title ?? '',
          description: draft.description ?? '',
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          location: draft.location ?? '',
          priceCents: draft.priceCents,
          organizerName: draft.organizerName ?? '',
          organizerContact: draft.organizerContact ?? '',
          domain: domainSlug,
          details,
          posterPath: draft.posterPath,
        }}
        signedUrls={signedUrls}
      />
    </FocusTemplate>
  )
}
