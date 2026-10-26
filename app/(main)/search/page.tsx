import { sanitizeOrTerm } from '@/lib/search-sanitize'
import { FrequencySearch } from '@/components/frequency/members/search/search-body'

// ── Types ─────────────────────────────────────────────────────────────────────
// The rows and the three gated reads live in ./search-data.ts, shared with the Frequency body.

// ── Result windows ────────────────────────────────────────────────────────────
// Each tab reads ONE bounded window; none of them cursors. Every window therefore
// over-fetches by exactly one row so the page can tell "that is all of them" from
// "that is the first N", and the UI says which (see `truncated` below). The tab count
// is shown ONLY when the window is complete: a truncated window is a floor, not a
// total, and printing it as a total was the bug (FINALIZE-PLAN §9.3).






// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  const { q = '', tab: rawTab = 'all' } = await searchParams
  const query = q.trim()
  // Sanitize before interpolating into PostgREST filters — this runs on the RLS-bypassing
  // service-role client, so an unsanitized `?q=` could inject extra `or()` conditions (ADR-274).
  const safe = sanitizeOrTerm(query)
  return <FrequencySearch query={query} safe={safe} rawTab={rawTab} />
}
