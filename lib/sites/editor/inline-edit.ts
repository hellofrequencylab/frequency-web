import { inlineHtmlToText } from '@/lib/entity-blocks/block-content'

export function inlineTextValue(value: string): string {
  return inlineHtmlToText(value).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()
}
export interface InlineTextMatch { field: string; start: number; end: number }

/** Identify the clicked paragraph without flattening its sibling paragraphs. */
export function findInlineTextMatch(props: Record<string, unknown>, fields: Record<string, { type?: string }>, target: string, occurrence = 0): InlineTextMatch | null {
  const plain = inlineTextValue(target)
  if (!plain) return null
  for (const [field, definition] of Object.entries(fields)) {
    const value = props[field]
    if (!['text', 'textarea'].includes(definition.type ?? '') || typeof value !== 'string') continue
    if (inlineTextValue(value) === plain && occurrence === 0) return { field, start: 0, end: value.length }
    const matches: InlineTextMatch[] = []
    const separator = /\n\s*\n|<\/p>\s*<p[^>]*>/gi
    let start = 0
    const check = (end: number) => {
      const segment = value.slice(start, end)
      if (inlineTextValue(segment) !== plain) return
      // Preserve outer paragraph tags and whitespace; editable innerHTML holds
      // only this paragraph's inline marks, not its structural paragraph wrapper.
      const prefix = /^\s*(?:<p[^>]*>)?/.exec(segment)?.[0] ?? ''
      const suffix = /(?:<\/p>)?\s*$/.exec(segment)?.[0] ?? ''
      matches.push({ field, start: start + prefix.length, end: end - suffix.length })
    }
    for (let match = separator.exec(value); match; match = separator.exec(value)) {
      check(match.index)
      start = separator.lastIndex
    }
    check(value.length)
    if (matches[occurrence]) return matches[occurrence]
  }
  return null
}
export function replaceInlineTextSegment(value: string, match: InlineTextMatch, replacement: string): string {
  return value.slice(0, match.start) + replacement + value.slice(match.end)
}
