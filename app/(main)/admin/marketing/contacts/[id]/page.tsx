import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { resolvePerson } from '@/lib/crm/person'

// RETIRED (ADR-459): the standalone member / contact page is gone. Everything about a person now shows
// inline on the Resonance CRM home (/admin/crm), so this route only forwards. We resolve the contact to
// its member profile id and land on that member, pre-selected (`?member=<profileId>`). A lead with no
// member profile (or any resolve miss) simply lands on the CRM home. Staff-gated, fail-safe, no 404s.
export const dynamic = 'force-dynamic'

export default async function ContactRedirect({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('janitor')
  const { id } = await params

  let profileId: string | null = null
  try {
    const person = await resolvePerson(id)
    profileId = person?.contact.profileId ?? null
  } catch {
    profileId = null
  }

  redirect(profileId ? `/admin/crm?member=${profileId}` : '/admin/crm')
}
