// Renders one or more Schema.org objects as a <script type="application/ld+json">.
// `<` is escaped so a stray "</script>" inside any string value can't break out
// of the script context (the standard JSON-LD injection guard).
//
// AN EMPTY LIST IS NOT PUBLISHED (SCAN-1274). A listing page with nothing on it (a topic with no
// circles yet, a filter with no matches) used to emit `ItemList` with `itemListElement: []`, which
// validators read as a list missing its required items. Measured on production 2026-11-19: 451
// such nodes. Dropping the node here covers every list builder at once; the page says the list is
// empty in words, and the structured data says nothing rather than something malformed.
function isEmptyItemList(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as { '@type'?: unknown; itemListElement?: unknown }
  return n['@type'] === 'ItemList' && Array.isArray(n.itemListElement) && n.itemListElement.length === 0
}

export function JsonLd({ data }: { data: object | object[] }) {
  const nodes = Array.isArray(data) ? data.filter((node) => !isEmptyItemList(node)) : isEmptyItemList(data) ? [] : data
  if (Array.isArray(nodes) && nodes.length === 0) return null
  const json = JSON.stringify(nodes).replace(/</g, '\\u003c')
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  )
}
