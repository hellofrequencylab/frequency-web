import { sanitizeOrTerm } from '@/lib/search-sanitize'

/** One bounded query shape for the palette and result page. SQL wildcards stay literal. */
export function searchTerms(query: string): string[] {
  return query.normalize('NFC').replace(/[(),]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 80)
    .split(' ').filter(Boolean).slice(0, 8).map((term) => sanitizeOrTerm(term)).filter(Boolean)
}

/** AND the words, OR the fields: "Thursday thrive" still finds "Thrive on Thursday". */
export function applySearchTerms<T extends { or: (filter: string) => T }>(builder: T, fields: string[], query: string): T {
  let result = builder
  for (const term of searchTerms(query)) result = result.or(fields.map((field) => `${field}.ilike.%${term}%`).join(','))
  return result
}

/** A failed provider is not a successful, empty search. Never expose database details to clients. */
export function searchRows<T>(result: { data: T[] | null; error?: unknown }, provider: string): T[] {
  if (result.error) throw new Error(`Search provider unavailable: ${provider}`)
  return result.data ?? []
}
