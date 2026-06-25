import Link from 'next/link'
import { ExternalLink, Pencil } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { EDITABLE_PAGES, listPages } from '@/lib/page-editor/data'
import { SectionHeader } from '@/components/ui/section-header'
import { TABLE_WRAP, HEAD_ROW, TH, BODY_ROW, VIEW_LINK, EDIT_BTN } from './shared'

// Pages-workspace layout module for the public, editor-backed MARKETING pages. Self-fetching,
// zero-prop RSC bound in lib/widgets/registry.tsx. Janitor-only (the public editors are
// Executive-Admin): it returns null for a non-janitor admin so they never dead-end in a gated
// editor. Home is a normal Puck-editable row (EDITABLE_PAGES): Edit opens /edit/home.

function fmt(d: string | null | undefined): string {
  if (!d) return 'Not published'
  const date = new Date(d)
  return isNaN(date.getTime())
    ? 'Not published'
    : `Published ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export async function PagesMarketing() {
  if (!(await getJanitor())) return null
  const pages = await listPages()

  return (
    <section>
      <SectionHeader title="Marketing pages" />
      <div className={`max-w-3xl ${TABLE_WRAP}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>Page</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {EDITABLE_PAGES.map((p) => {
              const row = pages[p.slug]
              const published = row?.status === 'published'
              return (
                <tr key={p.slug} className={BODY_ROW}>
                  <td className="px-4 py-3 font-medium text-text">{p.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                        published ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
                      }`}
                    >
                      {fmt(row?.published_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a href={p.path} target="_blank" rel="noreferrer" className={VIEW_LINK}>
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </a>
                      <Link href={`/edit/${p.slug}`} className={EDIT_BTN}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
