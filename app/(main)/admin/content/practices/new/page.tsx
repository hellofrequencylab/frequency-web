import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { NewPracticeForm } from './new-practice-form'

// Admin "Add practice" — a full-page create surface (replaces the modal for operators). Same
// gate as the library it returns to. The form hands off to the shared PracticeBuilder editor.
export const metadata = { title: 'Add a practice' }

export default async function NewPracticePage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Add a practice"
      eyebrow="Practices"
      description="Name it and add a short description. You'll set the Pillar, cadence, rewards, and tags in the editor on the next step."
      back={{ href: '/admin/content/practices', label: 'Practices' }}
      width="narrow"
    >
      <NewPracticeForm />
    </AdminTemplate>
  )
}
