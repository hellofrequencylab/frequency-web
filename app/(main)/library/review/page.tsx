import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { FocusTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// Leadership review queue — a circle Host or any Guide+ approves community submissions (practices,
// journeys) into the Library (ADR-109). The interior is module-driven (ADR-270/294): the
// queue block self-fetches the pending submissions and is Host-gated (returns null below Host), so
// the page's redirect stays the real gate. The page keeps only the guard + the Focus header + the
// back-link footer and renders <PageModules>.
export default async function LibraryReviewPage() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) redirect('/library')

  return (
    <FocusTemplate
      title="Review queue"
      description="Community submissions waiting to join the Library. Approve to publish into the pool; reject to send back."
      back={{ href: '/library', label: 'Library' }}
    >
      <PageModules route="/library/review" />

      <p className="mt-6 text-xs text-subtle">
        <Link href="/library" className="inline-flex items-center gap-1 text-primary-strong hover:underline">
          <ChevronLeft className="h-3 w-3" /> Back to the Library
        </Link>
      </p>
    </FocusTemplate>
  )
}
