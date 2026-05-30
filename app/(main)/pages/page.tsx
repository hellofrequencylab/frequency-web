import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Pencil } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { EDITABLE_PAGES, listPages } from '@/lib/page-editor/data'

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Pages</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        Visually edit the public marketing pages — drag sections, edit text, swap
        images. Changes go live when you hit Publish. The member app isn&apos;t
        affected.
      </p>

      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-subtle">
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
                      className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${
                        published ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
                      }`}
                    >
                      {fmt(row?.published_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href={p.slug === 'home' ? '/?preview=1' : p.path}
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
    </div>
  )
}
