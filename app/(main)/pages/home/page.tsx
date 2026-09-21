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
// page-content system (route '/'), nothing else. The homepage BODY is the published
// page-editor document (owner ruling 2026-08-24, OWN-043; app/page.tsx resolves
// getPublishedData('home') first), edited at /edit/home. This form used to say the body
// was "a coded experience (live counts)", which stopped being true when the home template
// landed; a copy pass on the front door touches that document AND this form (LIVE-252).
export default async function HomeSeoPage() {
  if (!(await getJanitor())) notFound()

  const current = await getPageContent('/')
  const fallback = { title: `${SITE_NAME} · ${SITE_TAGLINE}`, description: SITE_DESCRIPTION }

  return (
    <AdminPage
      title="Home"
      eyebrow="Pages"
      description="SEO title and description only. The homepage body is the published home document in the page editor (Edit home), not this form."
      width="narrow"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/pages"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All pages
          </Link>
          <a
            href="/?preview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
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
