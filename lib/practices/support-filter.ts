/** Current authored support is separate from historical reward attribution. No IO or taxonomy copy. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (value: unknown): string | null => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null

interface PracticeSupports {
  domain_id: string | null
  secondary_domain_id?: string | null
  focus_details?: unknown
}

/** Each applicable support once; legacy primary values remain meaningful to existing callers. */
export function practiceSupportIds(row: PracticeSupports): string[] {
  const ids = new Set<string>()
  if (row.domain_id) ids.add(uuid(row.domain_id) ?? row.domain_id)
  const secondary = uuid(row.secondary_domain_id)
  if (secondary) ids.add(secondary)
  if (row.focus_details && typeof row.focus_details === 'object' && !Array.isArray(row.focus_details)) {
    for (const [key, value] of Object.entries(row.focus_details)) {
      // The query below uses canonical database UUID keys and JSON object containment.
      if (uuid(key) === key && value && typeof value === 'object' && !Array.isArray(value)) ids.add(key)
    }
  }
  return [...ids]
}

/** Mirrors the database predicate for the residual facet counter. */
export function practiceSupportsPillar(row: PracticeSupports, pillarId: string): boolean {
  const normalized = uuid(pillarId)
  return normalized ? practiceSupportIds(row).includes(normalized) : row.domain_id === pillarId
}

/** Filters the database set before sort/count/pagination. A single row can match several branches once. */
export function applyPracticePillarFilter<Q extends {
  eq: (field: string, value: unknown) => Q
  or: (filter: string) => Q
}>(query: Q, pillarId: string): Q {
  const id = uuid(pillarId)
  // Keep legacy equality behavior, but never place an unchecked identifier in PostgREST grammar.
  if (!id) return query.eq('domain_id', pillarId)
  return query.or(`domain_id.eq.${id},secondary_domain_id.eq.${id},focus_details.cs.${JSON.stringify({ [id]: {} })}`)
}
