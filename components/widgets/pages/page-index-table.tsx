import Link from 'next/link'
import { ExternalLink, Pencil, ArrowRight } from 'lucide-react'
import { EDITOR_LABEL, type IndexedPage } from '@/lib/pages/index-catalog'
import type { PageRow } from '@/lib/page-editor/data'
import { TABLE_WRAP, HEAD_ROW, TH, BODY_ROW, VIEW_LINK, EDIT_BTN } from './shared'

// The one table every public list in the Pages workspace draws (Site, Lead and SEO, System). A row
// is an IndexedPage from lib/pages/index-catalog; its `editor` decides the Content badge and whether
// an Edit button exists at all. View always opens the live page. Edit appears only on a block-editor
// row, and only for a janitor (the public editors are Executive-Admin), so a Site Admin reads the
// whole index and is never sent into a gated editor. A Funnel row links to the Funnels library.

function publishedLabel(row: PageRow | undefined): { text: string; live: boolean } {
  if (row?.status !== 'published' || !row.published_at) return { text: 'Default template', live: false }
  const date = new Date(row.published_at)
  if (isNaN(date.getTime())) return { text: 'Default template', live: false }
  return { text: `Published ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, live: true }
}

export function PageIndexTable({
  pages,
  rows,
  canEdit,
}: {
  pages: readonly IndexedPage[]
  /** The `pages` table by slug, for the publish status of block-editor rows. */
  rows: Record<string, PageRow>
  /** Whether the viewer may open the block editor (janitor). */
  canEdit: boolean
}) {
  return (
    <div className={`max-w-3xl ${TABLE_WRAP}`}>
      <table className="w-full text-body-sm">
        <thead>
          <tr className={HEAD_ROW}>
            <th className={TH}>Page</th>
            <th className={TH}>Content</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => {
            const blocks = p.editor === 'blocks' && p.slug
            const status = blocks ? publishedLabel(rows[p.slug!]) : { text: 'Live', live: true }
            return (
              <tr key={p.path} className={BODY_ROW}>
                <td className="px-4 py-3">
                  <div className="font-medium text-text">
                    {p.label}
                    {p.count != null && (
                      <span className="ml-2 text-meta font-medium tabular-nums text-subtle">
                        {p.count} {p.count === 1 ? 'page' : 'pages'}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-meta text-subtle">{p.path}</div>
                  {p.note && <div className="mt-0.5 text-meta text-muted">{p.note}</div>}
                </td>
                <td className="px-4 py-3 text-muted">{EDITOR_LABEL[p.editor]}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-meta font-medium ${
                      status.live ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
                    }`}
                  >
                    {status.text}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <a href={p.path} target="_blank" rel="noreferrer" className={VIEW_LINK}>
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </a>
                    {blocks && canEdit && (
                      <Link href={`/edit/${p.slug}`} className={EDIT_BTN}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    )}
                    {p.editor === 'funnel' && canEdit && (
                      <Link href="/pages/sequences" className={EDIT_BTN}>
                        <ArrowRight className="h-3.5 w-3.5" /> Funnels
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
