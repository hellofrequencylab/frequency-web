import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Pencil, Rocket, ArrowRight } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { EDITABLE_PAGES, listPages } from '@/lib/page-editor/data'
import { listSequences } from '@/lib/onboarding/beta-sequences'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'

export const dynamic = 'force-dynamic'

function fmt(d: string | null | undefined): string {
  if (!d) return 'Not published'
  const date = new Date(d)
  return isNaN(date.getTime())
    ? 'Not published'
    : `Published ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export default async function PagesDirectory() {
  // Janitor-only. This is the directory of editable public "static" pages.
  if (!(await getJanitor())) notFound()

  const pages = await listPages()
  const sequences = listSequences()

  return (
    <IndexTemplate
      title="Pages"
      description="Edit your public-facing pages: the marketing splash pages and the audience-targeted onboarding sequences. Changes go live when you publish. The member app isn't affected."
    >
      <SectionHeader title="Marketing pages" />
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-x-auto max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 font-semibold">Page</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {EDITABLE_PAGES.map((p) => {
              const row = pages[p.slug]
              const published = row?.status === 'published'
              return (
                <tr key={p.slug} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-text font-medium">{p.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                        published ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
                      }`}
                    >
                      {fmt(row?.published_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href={p.path}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </a>
                      <Link
                        href={`/edit/${p.slug}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Onboarding sequences — the audience-targeted induction splash pages. Each
          drives the founder induction in its own voice; the manager sets entry
          points, share links + QR, and cohort tags. */}
      <div className="mt-10">
        <SectionHeader
          title="Onboarding sequences"
          action={
            <Link
              href="/pages/sequences"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary-hover"
            >
              Manage all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="max-w-3xl overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
                <th className="px-4 py-2.5 font-semibold">Audience</th>
                <th className="px-4 py-2.5 font-semibold">Splash</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq) => (
                <tr key={seq.slug} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-text">
                    <span className="inline-flex items-center gap-2">
                      <Rocket className="h-3.5 w-3.5 shrink-0 text-primary-strong" /> {seq.audience}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-subtle">/beta/{seq.slug}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href={`/beta/${seq.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </a>
                      <Link
                        href="/pages/sequences"
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IndexTemplate>
  )
}
