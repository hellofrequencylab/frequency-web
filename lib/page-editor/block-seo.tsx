// ─────────────────────────────────────────────────────────────────────────────
// Structured data for BLOCK-BUILT pages — the SEO/AIO schema a Puck-published page
// would otherwise DROP relative to a hand-coded one.
//
// FAQ schema is emitted by the FAQ blocks themselves (Accordion + SpaceFAQ each
// render their own <JsonLd data={faqSchema(...)} />), so it travels with the block
// no matter which surface renders it. ARTICLE schema is page-level (it needs the
// page's canonical URL, which a block can't know), so it lives here: a content route
// that renders an operator doc through <BlockRender> also renders <BlockDocJsonLd>,
// which derives the Article headline + description from the doc's own blocks and
// stamps the route's path. Mirrors the existing `<JsonLd data={articleSchema(...)} />`
// usage on coded pages (lib/jsonld.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { JsonLd } from '@/components/json-ld'
import { articleSchema } from '@/lib/jsonld'
import { richPlainText } from '@/lib/page-editor/richtext'
import type { Data } from '@/lib/page-editor/types'

// First non-empty string among `keys`, scanned across top-level blocks, reduced to
// plain text (markdown stripped). Headlines/leads live at the top of a page, so a
// top-level scan is enough and avoids pulling copy out of nested slots.
function firstProp(data: Data, keys: string[]): string {
  for (const item of data.content ?? []) {
    const props = item.props as Record<string, unknown>
    for (const k of keys) {
      const v = props[k]
      if (typeof v === 'string' && v.trim()) return richPlainText(v).trim()
    }
  }
  return ''
}

/** Emit Article schema for an operator page rendered from a `Data` doc. The headline
 *  and description are taken from explicit props when given, else derived from the
 *  doc's first heading / first prose block. Emits nothing unless BOTH a headline and
 *  a description resolve (Google requires them), so an empty/atypical doc is silent. */
export function BlockDocJsonLd({
  data,
  path,
  title,
  description,
  published,
  updated,
}: {
  data: Data
  /** The route's canonical path — becomes the Article url / @id. */
  path: string
  /** Override the derived headline (defaults to the doc's first heading). */
  title?: string
  /** Override the derived description (defaults to the doc's first prose block). */
  description?: string
  published?: string | null
  updated?: string | null
}) {
  const headline = (title ?? firstProp(data, ['title', 'heading', 'text'])).trim()
  const desc = (description ?? firstProp(data, ['subtitle', 'lead', 'body', 'text'])).trim().slice(0, 300)
  if (!headline || !desc) return null
  return <JsonLd data={articleSchema({ title: headline, description: desc, path, published, updated })} />
}
