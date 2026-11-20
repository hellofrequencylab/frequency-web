// WHERE A PICK LANDS IN THE SPOTLIGHT PREVIEW (LIVE-2453). The Spotlight editor shows the real page in a frame
// (components/spotlight/spotlight-preview-frame.tsx). A block drawn by the shared block renderer carries its node
// id (`data-spotlight-nid`); a link may be drawn by a theme's own layout, so a link is found by its address.
// Pure: no DOM, so the matching is testable on its own.

import type { NodeLayout } from '@/lib/entity-blocks/node-tree'

export interface PreviewLink {
  nid: string
  index: number
  url: string
}

/** Compare two link addresses the way a reader would: no scheme case, no trailing slash, no `www.`. */
export function sameLinkUrl(a: string, b: string): boolean {
  const norm = (u: string) =>
    u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
  return !!a && !!b && norm(a) === norm(b)
}

/** Every owner link on the page, in reading order: each placed Links block's items, with the block's node id. */
export function previewLinks(layout: NodeLayout | null): PreviewLink[] {
  if (!layout) return []
  const out: PreviewLink[] = []
  for (const row of layout.rows)
    for (const node of row.cells.flat()) {
      if (node.type !== 'links' || node.hidden) continue
      const items = (node.content as { items?: unknown } | undefined)?.items
      if (!Array.isArray(items)) continue
      items.forEach((it, index) => {
        const url = (it as { url?: unknown })?.url
        if (typeof url === 'string' && url) out.push({ nid: node.nid, index, url })
      })
    }
  return out
}

/** The link a press on `href` in the preview means, if it is one of the owner's. */
export function linkForHref(layout: NodeLayout | null, href: string): PreviewLink | null {
  return previewLinks(layout).find((l) => sameLinkUrl(l.url, href)) ?? null
}
