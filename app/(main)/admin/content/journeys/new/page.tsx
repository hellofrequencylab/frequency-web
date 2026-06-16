import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { NewJourneyForm } from './new-journey-form'

// Admin "Add journey" — a full-page create surface (replaces the modal for operators). Same
// gate as the library it returns to. The form hands off to the journey structure editor.
export const metadata = { title: 'Add a journey' }

export default async function NewJourneyPage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Add a journey"
      eyebrow="Journeys"
      description="Name it and add a short summary. You'll build the phases, lessons, and practices in the editor on the next step."
      back={{ href: '/admin/content/journeys', label: 'Journeys' }}
      width="narrow"
    >
      <NewJourneyForm />
    </AdminTemplate>
  )
}
