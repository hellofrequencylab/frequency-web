import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getPractice } from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { IndexTemplate } from '@/components/templates/index-template'
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
  if (practice.created_by !== profileId) {
    // Not yours — you can only edit your own. (Customize a copy from the library.)
    notFound()
  }

  const pillars = await getPillars()

  return (
    <IndexTemplate title="Edit practice" description="Shape your practice — its cadence, guide, and how it shows up across the app.">
      <div className="max-w-2xl space-y-5">
        <Link href="/practices" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to practices
        </Link>
        <PracticeEditor practice={practice} pillars={pillars.map((p) => ({ id: p.id, name: p.name }))} />
      </div>
    </IndexTemplate>
  )
}
