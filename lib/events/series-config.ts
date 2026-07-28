import 'server-only'
import { cache } from 'react'
import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-flags'
import { DEFAULT_SERIES_DISPLAY, coerceSeriesDisplay, type SeriesDisplayConfig } from './series-config.shared'

// The OPERATOR KNOBS for the repeating-events fold (ADR-897 §7.1-§7.2): three integers an owner can
// change with no deploy, stored as ONE JSON row in the existing `platform_settings` table under the
// key `events_series_display`.
//
// WHY NO MIGRATION: `platform_settings` has existed since
// supabase/migrations/20260616170000_platform_settings.sql:10 (service-role only, no client
// policies), and lib/platform-flags.ts already ships a request-cached reader and an upserting
// writer. `platform_flags` cannot hold these (boolean by its own source note) and
// `ElementSetting.kind` is 'toggle' | 'choice'. A new table would buy three integers a migration,
// an RLS policy and a second settings pattern.
//
// WHY NO SEED ROW: a seeded row becomes a SECOND source of truth for the default. The day someone
// changes DEFAULT_CARDS_PER_SERIES in code, the seeded row silently wins in production and nowhere
// else. `vera_autonomy` and `beta_ends_at` are unseeded for exactly this reason. Absent row ->
// getPlatformSetting returns the '' fallback -> the coercion below returns the code defaults, so
// ZERO CONFIGURATION IS EXACTLY 3 / 5 / 2 with nothing written anywhere.
//
// 🔴 THE KILL SWITCH IS REAL, and this is the exact statement. `cardsPerSeries = 60` restores
// pre-fold behaviour: 60 is at or above the row count any cadence can reach inside the 60-day
// materialisation horizon (ADR-007), so every date shows again. One upsert, no deploy:
//
//   insert into public.platform_settings (key, value)
//   values ('events_series_display', '{"cardsPerSeries":60,"railDates":20,"indexedOccurrences":10}')
//   on conflict (key) do update set value = excluded.value, updated_at = now();
//
// To go back to the SHIPPED behaviour, DELETE the row rather than writing the defaults into it
// (see "no seed row" above):
//
//   delete from public.platform_settings where key = 'events_series_display';
//
// ⚠️ A hand-run SQL statement does not purge statically rendered pages; they pick the new number up
// on their next render. The console form is the supported path because its action calls
// revalidatePath('/', 'layout'). The runbook (docs/EVENTS-SERIES-BUILD-PLAN.md §9) says so.
//
// SERVER-ONLY on purpose: the event create/edit forms are client components and will want
// `railDates` for their preview count. `import 'server-only'` turns an accidental client import
// into a BUILD error instead of a leaked service-role path. vitest.config.ts stubs the module.
//
// 🔴 AND IT ALREADY FIRED, which is why the pure half now lives next door. The knob's own console
// (a client component) imported MIN_/MAX_ from HERE. tsc passed, the full vitest run passed (vitest
// aliases `server-only` to a stub), and `pnpm build` failed with "'server-only' cannot be imported
// from a Client Component module". The bounds, the config type and the coercion table therefore sit
// in ./series-config.shared (pure, importable from anywhere) and are RE-EXPORTED below, so every
// existing server importer of this module is unchanged. Client code must import the shared module.
//
// NO AUDIT LEDGER: platform_flag_events is boolean-only, so these three integers are unlogged, the
// same gap `vera_autonomy` carries. Noted in ADR-897's consequences; do not build a parallel ledger
// for three numbers.

/** The one platform_settings key. */
export const SERIES_DISPLAY_KEY = 'events_series_display'

// The client-safe half, re-exported so `@/lib/events/series-config` remains the one import path a
// SERVER caller needs (house pattern: lib/spotlight/top-friends.ts over ./top-friends.types).
export {
  MIN_CARDS_PER_SERIES,
  MAX_CARDS_PER_SERIES,
  MIN_RAIL_DATES,
  MAX_RAIL_DATES,
  MIN_INDEXED_OCCURRENCES,
  MAX_INDEXED_OCCURRENCES,
  DEFAULT_SERIES_DISPLAY,
  coerceSeriesDisplay,
} from './series-config.shared'
export type { SeriesDisplayConfig } from './series-config.shared'

/**
 * The read every consumer uses. React cache(), so a page that asks from three loaders pays one
 * round trip; getPlatformSetting is cache()d on (key, fallback) too, and this second layer also
 * dedupes the JSON parse and the coercion.
 *
 * FAIL-SAFE: a missing row, malformed JSON, or any read error returns the code defaults. The worst
 * outcome of total settings failure is the product's own recommended behaviour.
 *
 * ⚠️ Never call this from a client component (it is server-only), never from inside
 * lib/events/series.ts (the fold is pure and import-free by design), and read it ONCE per surface
 * at the top of the loader, never per row.
 */
export const getSeriesDisplayConfig = cache(async (): Promise<SeriesDisplayConfig> => {
  try {
    return coerceSeriesDisplay(await getPlatformSetting(SERIES_DISPLAY_KEY, ''))
  } catch {
    return { ...DEFAULT_SERIES_DISPLAY }
  }
})

/**
 * Persist a partial patch, merged and clamped over the CURRENT stored value.
 *
 * Returns the STORED value, not the patch: an operator who types 99 sees 60 come back and learns
 * the range, instead of believing the 99 landed. Operator-gated callers only (the server action
 * re-verifies janitor).
 */
export async function saveSeriesDisplayConfig(
  patch: Partial<SeriesDisplayConfig>,
  changedBy?: string | null,
): Promise<SeriesDisplayConfig> {
  const current = await getSeriesDisplayConfig()
  // Field by field rather than a spread: `{ ...current, ...patch }` lets an EXPLICIT `undefined` in
  // the patch overwrite a real current value, which would silently reset an untouched field to the
  // default on every save.
  const next = coerceSeriesDisplay({
    cardsPerSeries: patch.cardsPerSeries ?? current.cardsPerSeries,
    railDates: patch.railDates ?? current.railDates,
    indexedOccurrences: patch.indexedOccurrences ?? current.indexedOccurrences,
  })
  await setPlatformSetting(SERIES_DISPLAY_KEY, JSON.stringify(next), changedBy ?? null)
  return next
}
