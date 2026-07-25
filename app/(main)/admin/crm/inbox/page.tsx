import { redirect } from 'next/navigation'

// RETIRED (ADR-820): the platform flat inbox folded into the Conversations workspace — one ticketed,
// assignable system on the comms spine, with the shared reply pipeline (renderReplyEmail + signature +
// per-conversation Reply-To + batching + the transactional gate) and the F5 tenant-lane seal the flat
// inbox never had. Deep links keep working via this redirect; the open loops were backfilled onto the
// spine (migration 20261219000000) and the CRM timeline of record (contact_interactions) is untouched.

export default function CrmInboxPage() {
  redirect('/admin/crm/conversations')
}
