import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { requireLeadFloor } from '@/lib/admin/guard'
import { getAllTrainingCategories, trainingHref, TRAINING_BASE } from '@/lib/leader-training/content'
import { TrainingNav } from '@/components/training/training-nav'

// Leader Training docs library — a two-pane documentation shell (left category index, right
// content), the leader-gated twin of the public help center. The route rides the default
// Member chrome (lib/layout/page-chrome.ts MANAGED_ROUTES registers it as a Member surface,
// global rail — it is NOT in any Focus/no-rail list), so the two panes render beside the
// community rail; this layout adds the left index in-body. Gate is re-asserted fail-closed
// even though the parent /lead layout already runs requireLeadFloor().
export default async function TrainingLibraryLayout({ children }: { children: React.ReactNode }) {
  await requireLeadFloor()
  const categories = await getAllTrainingCategories()
  const nav = categories.map((c) => ({
    slug: c.slug,
    title: c.title,
    docs: c.docs.map((d) => ({ slug: d.slug, title: d.title, href: trainingHref(c.slug, d.slug) })),
  }))

  return (
    <div className="flex w-full gap-8 lg:gap-10">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-24 space-y-6">
          <Link
            href={TRAINING_BASE}
            className="inline-flex items-center gap-2 text-body-sm font-semibold text-text transition-colors hover:text-primary-strong"
          >
            <GraduationCap className="h-4 w-4 text-subtle" /> Leader Training
          </Link>
          <TrainingNav categories={nav} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
