import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { getPageContent } from '@/lib/page-content'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from '@/lib/site'
import { AdminPage } from '@/components/admin/admin-page'
import { HomeSeoForm } from './form'

export const dynamic = 'force-dynamic'

// The home page's tiny SEO editor: title + meta description through the ADR-180
// page-content system (route '/'), nothing else. The homepage body is a coded
// experience (live counts, parallax) and is deliberately NOT Puck-editable — see
// the EDITABLE_PAGES note in lib/page-editor/data.ts.
export default async function HomeSeoPage() {
  if (!(await getJanitor())) notFound()

  const current = await getPageContent('/')
  const fallback = { title: `${SITE_NAME} · ${SITE_TAGLINE}`, description: SITE_DESCRIPTION }

  return (
    <AdminPage
      title="Home"
      eyebrow="Pages"
      description="SEO title and description only. The homepage itself is a coded experience (live counts) and stays in code."
      width="narrow"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/pages"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All pages
          </Link>
          <a
            href="/?preview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View home
          </a>
        </div>
      }
    >
      <HomeSeoForm
        initial={{ title: current?.title ?? '', description: current?.description ?? '' }}
        fallback={fallback}
      />
    </AdminPage>
  )
}
