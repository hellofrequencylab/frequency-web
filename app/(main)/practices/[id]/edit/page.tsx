import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getPractice, listSubcategories, getPracticeTagLabels } from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { FocusTemplate } from '@/components/templates'
import { PracticeEditor } from '@/components/practice/practice-editor'

export const metadata: Metadata = { title: 'Edit practice' }
export const dynamic = 'force-dynamic'

// Edit a practice you created (ADR-096). Free for any member, on their OWN practices
// (ownership enforced). To change a library practice you don't own, the library page
// offers "Customize" (fork → a private copy → here).
export default async function EditPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/practices/${id}/edit`)

  const practice = await getPractice(id)
  if (!practice) notFound()
  if (practice.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access')) {
    // Not yours, and not an admin — you can only edit your own. (Customize a copy.)
    notFound()
  }

  const [pillars, subcategories, tags] = await Promise.all([
    getPillars(),
    listSubcategories(),
    getPracticeTagLabels(id),
  ])

  return (
    <FocusTemplate
      title="Edit practice"
      description="Shape your practice — its cadence, guide, and how it shows up across the app."
      back={{ href: '/practices', label: 'Practices' }}
    >
      <PracticeEditor
        practice={practice}
        pillars={pillars.map((p) => ({ id: p.id, name: p.name }))}
        subcategories={subcategories.map((s) => ({ id: s.id, domain_id: s.domain_id, name: s.name }))}
        initialTags={tags}
      />
    </FocusTemplate>
  )
}
