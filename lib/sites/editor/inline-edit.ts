import { inlineHtmlToText } from '@/lib/entity-blocks/block-content'

export function inlineTextValue(value: string): string {
  return inlineHtmlToText(value).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()
}
export interface InlineTextMatch { field: string; start: number; end: number; path?: (string | number)[] }
export type InlineTextKind = 'heading' | 'body' | 'label' | 'generic'
export interface InlineFieldDefinition { type?: string; contentEditable?: boolean; arrayFields?: Record<string, InlineFieldDefinition>; objectFields?: Record<string, InlineFieldDefinition> }

/** Match only authored schema fields, including nested card/list copy. Live metadata is never edited. */
export function findInlineTextMatch(props: Record<string, unknown>, fields: Record<string, InlineFieldDefinition>, target: string, occurrence = 0, kind: InlineTextKind = 'generic'): InlineTextMatch | null {
  const plain = inlineTextValue(target)
  if (!plain) return null
  const matches: { match: InlineTextMatch; key: string }[] = []
  function visit(value: unknown, definition: InlineFieldDefinition, field: string, path: (string | number)[], depth = 0) {
    if (depth > 10 || definition.contentEditable === false) return
    if (definition.type === 'array' && Array.isArray(value)) {
      value.forEach((item, index) => { if (item && typeof item === 'object') for (const [key, child] of Object.entries(definition.arrayFields ?? {})) visit((item as Record<string, unknown>)[key], child, field, [...path, index, key], depth + 1) })
      return
    }
    if (definition.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(definition.objectFields ?? {})) visit((value as Record<string, unknown>)[key], child, field, [...path, key], depth + 1)
      return
    }
    if (!(['text', 'textarea'].includes(definition.type ?? '') || definition.contentEditable === true) || typeof value !== 'string') return
    const separator = /\n\s*\n|<\/p>\s*<p[^>]*>/gi
    let start = 0
    const check = (end: number) => {
      const segment = value.slice(start, end)
      if (inlineTextValue(segment) !== plain) return
      const prefix = /^\s*(?:<p[^>]*>)?/.exec(segment)?.[0] ?? ''
      const suffix = /(?:<\/p>)?\s*$/.exec(segment)?.[0] ?? ''
      matches.push({ match: { field, start: start + prefix.length, end: end - suffix.length, ...(path.length ? { path } : {}) }, key: String(path.at(-1) ?? field) })
    }
    for (let match = separator.exec(value); match; match = separator.exec(value)) { check(match.index); start = separator.lastIndex }
    check(value.length)
  }
  for (const [field, definition] of Object.entries(fields)) visit(props[field], definition, field, [])
  const roleKeys: Record<InlineTextKind, string[]> = {
    heading: ['title', 'headline', 'heading', 'text'],
    body: ['body', 'lead', 'text', 'description', 'blurb', 'caption', 'kicker', 'eyebrow', 'tagline', 'answer', 'a', 'subtitle', 'subheading', 'summary', 'quote'],
    label: ['label', 'ctaLabel', 'linkLabel', 'buttonLabel', 'buttonText', 'text', 'question', 'q'],
    generic: [],
  }
  const relevant = matches.filter((candidate) => roleKeys[kind].includes(candidate.key))
  const candidates = relevant.length ? relevant : matches
  // Same words in different semantic fields are not an identity. Keep the
  // inspector available rather than silently changing a neighbouring field.
  if (new Set(candidates.map((candidate) => [candidate.match.field, ...(candidate.match.path ?? []).filter((key) => typeof key === 'string')].join('.'))).size > 1) return null
  return candidates[occurrence]?.match ?? null
}
export function replaceInlineTextSegment(value: string, match: InlineTextMatch, replacement: string): string {
  return value.slice(0, match.start) + replacement + value.slice(match.end)
}
export function inlineFieldValue(props: Record<string, unknown>, match: InlineTextMatch): string {
  let value: unknown = props[match.field]
  for (const key of match.path ?? []) value = value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined
  return typeof value === 'string' ? value : ''
}
/** Clone just the containing array/object field so one card edit preserves its siblings. */
export function replaceInlineField(props: Record<string, unknown>, match: InlineTextMatch, replacement: string): unknown {
  const path = match.path ?? []
  const replace = (value: unknown, depth: number): unknown => {
    if (depth === path.length) return replaceInlineTextSegment(typeof value === 'string' ? value : '', match, replacement)
    if (!value || typeof value !== 'object') return value
    const key = path[depth]
    const copy: Record<string | number, unknown> | unknown[] = Array.isArray(value) ? [...value] : { ...value }
    ;(copy as Record<string | number, unknown>)[key] = replace((value as Record<string | number, unknown>)[key], depth + 1)
    return copy
  }
  return replace(props[match.field], 0)
}
