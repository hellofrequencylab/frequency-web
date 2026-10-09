import type { ContentItem } from '@/lib/page-editor/types'

/** Preserve authored copy while bridging legacy theme fields to registered schemas. */
export function normalizeWebsiteFields(block: ContentItem): ContentItem {
  const aliases: Record<string, [string, string]> = { Heading: ['title', 'text'], DisplayHeading: ['text', 'title'], Text: ['body', 'text'], Prose: ['text', 'body'] }
  const alias = aliases[block.type]
  if (alias && typeof block.props[alias[1]] === 'string') {
    const props = { ...block.props }
    if (typeof props[alias[0]] !== 'string') props[alias[0]] = props[alias[1]]
    delete props[alias[1]]
    return { ...block, props }
  }
  const variants = block.type === 'EditorialSection' ? ['lead', 'prose', 'faq', 'stats'] : block.type === 'Zigzag' ? ['lead', 'list', 'quote'] : null
  if (!variants || typeof block.props.body !== 'string' || variants.includes(block.props.body)) return block
  return { ...block, props: { ...block.props, lead: typeof block.props.lead === 'string' && block.props.lead.trim() ? block.props.lead : block.props.body, body: block.type === 'EditorialSection' ? 'prose' : 'lead' } }
}
