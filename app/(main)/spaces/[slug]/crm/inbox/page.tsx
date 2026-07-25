import { redirect } from 'next/navigation'

// RETIRED (ADR-820): the Space flat inbox folded into the Conversations workspace — one ticketed,
// assignable system on the comms spine, with the shared reply pipeline (renderReplyEmail + brand
// signature + per-conversation Reply-To + batching + the transactional gate). Deep links keep
// working via this redirect; the open loops were backfilled onto the spine (migration 20261219000000)
// and the CRM timeline of record (contact_interactions) is untouched.

export default async function SpaceInboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/spaces/${slug}/crm/conversations`)
}
