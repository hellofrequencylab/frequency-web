import 'server-only'
import { revalidateTag, unstable_cache, updateTag } from 'next/cache'

// ── The ONE cross-request cache seam (LIVE-181, ADR-1243) ──────────────────────────────────────
//
// Before this module the repo had ZERO cross-request caching: React `cache()` deduped a read
// inside one render and nothing survived past the response. The global nav chrome (menus,
// menu_settings, page_chrome_overrides, app_overrides, the demo_mode flag) is identical for every
// viewer and changes only when an operator saves something, so every member page view was
// re-reading 20 rows that had not changed since the last operator edit.
//
// WHAT MAY GO THROUGH HERE, and it is a short list: data that is the SAME FOR EVERY VIEWER and
// changes RARELY, read with the service-role client, with an operator write path that calls
// `invalidateCacheTag` beside its write. Nothing keyed on the viewer (their profile, roles, unread
// counts, cookies, headers) may ever be cached across requests: React `cache()` is the per-request
// tool for that, and the notes at lib/circles/store.ts and lib/people/associations.ts say why.
//
// 🔴 THE PRIVILEGE RULE. A cached value must be the ROWS, not a viewer's view of them. The menu
// reader caches raw menu rows and the per-viewer filtering (components/layout/menu-role
// canSeeMenuItem / effectiveMode) runs in the renderer, AFTER the boundary; the registry gates
// (lib/menus/gates.ts) are re-derived from code after it too, so a code change to a gate takes
// effect on the next request without an invalidation. lib/cross-request-cache.test.ts pins both.
//
// WHY `unstable_cache` AND NOT `'use cache'`. Next 16 replaces `unstable_cache` with the
// `'use cache'` directive, but that directive needs `cacheComponents: true` in next.config.ts,
// which turns on Partial Prerendering for the whole app and changes how every route renders.
// This app runs the previous model (node_modules/next/dist/docs/01-app/02-guides/
// caching-without-cache-components.md), where `unstable_cache` is the documented tool for
// non-fetch reads. Moving to Cache Components is its own decision, not a side effect of a
// perf row.
//
// OUTSIDE A NEXT REQUEST there is no incremental cache: `unstable_cache` throws
// `Invariant: incrementalCache missing` (error code E469) before it calls the wrapped function.
// That is vitest, a script, and any runtime that is not the Next server. `crossRequestCached`
// falls through to the uncached read on exactly that error and no other, so a loader tested
// under vitest exercises its real read path and a real failure still surfaces.
//
// THE CEILING. Every entry also carries `revalidate: CROSS_REQUEST_CEILING_SECONDS`. Tags are the
// invalidation; the ceiling exists for the write that bypasses the app, which this repo documents
// as a real operator move (lib/menus/read.ts: "reset the admin_header DB menu so it falls back to
// code", done in SQL). Ten minutes bounds how long such an edit can go unseen.

/** The tags the shell's global chrome sources are cached under, one per table. An operator write
 *  path invalidates the tag beside its write (`invalidateCacheTag`). */
export const CHROME_CACHE_TAGS = {
  /** `menus` + `menu_categories` + `menu_items` + `menu_rail_cards` (lib/menus/read.ts). */
  menus: 'chrome-menus',
  /** The `menu_settings` singleton (lib/menus/read.ts). */
  menuSettings: 'chrome-menu-settings',
  /** `page_chrome_overrides` (lib/layout/chrome-sources.ts). */
  pageChrome: 'chrome-page-overrides',
  /** `app_overrides` (lib/layout/chrome-sources.ts). */
  appOverrides: 'chrome-app-overrides',
  /** `platform_flags` rows read through `platformFlagRow` (lib/platform-flags.ts). */
  platformFlags: 'platform-flags',
} as const

export type ChromeCacheTag = (typeof CHROME_CACHE_TAGS)[keyof typeof CHROME_CACHE_TAGS]

/** How long a cached row set may live without a tag invalidation (seconds). */
export const CROSS_REQUEST_CEILING_SECONDS = 600

type AsyncFn<A extends unknown[], R> = (...args: A) => Promise<R>

function nextErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const code = (err as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE
  return typeof code === 'string' ? code : null
}

/** `unstable_cache` threw before reaching the wrapped read because there is no incremental cache
 *  in this runtime (E469). The message check is the belt for a Next build that drops the code. */
export function isCacheUnavailable(err: unknown): boolean {
  if (nextErrorCode(err) === 'E469') return true
  const message = err instanceof Error ? err.message : ''
  return message.includes('incrementalCache missing')
}

/** Wrap a viewer-independent, service-role read so its result survives across requests until one
 *  of `tags` is invalidated or the ceiling passes. The wrapped read must take only JSON-serialisable
 *  arguments (they are the cache key, with `keyParts`), return only JSON (it is stored as JSON), and
 *  THROW on a failed query rather than return a fallback, because a returned fallback would be
 *  cached as if it were the data. The caller owns the fallback, after the boundary. */
export function crossRequestCached<A extends (string | number | boolean | null)[], R>(
  read: AsyncFn<A, R>,
  keyParts: readonly string[],
  opts: { tags: readonly ChromeCacheTag[] },
): AsyncFn<A, R> {
  const cached = unstable_cache(read, [...keyParts], {
    tags: [...opts.tags],
    revalidate: CROSS_REQUEST_CEILING_SECONDS,
  })
  return async (...args: A): Promise<R> => {
    try {
      return await cached(...args)
    } catch (err) {
      if (isCacheUnavailable(err)) return read(...args)
      throw err
    }
  }
}

/** Expire every cached entry under `tag`, immediately. Call it beside the write.
 *
 *  `updateTag` is the Server Action form (read-your-own-writes: the operator's next request sees
 *  the row they just saved). It refuses to run anywhere else (E872: a Route Handler, a cron), so
 *  that case falls to `revalidateTag(tag, { expire: 0 })`, which is the same immediate expiry
 *  without the action-only guard. Outside a Next request entirely (E263: vitest, a script) there
 *  is nothing cached, so there is nothing to do. Any other error is a real one and surfaces. */
export function invalidateCacheTag(tag: ChromeCacheTag): void {
  try {
    updateTag(tag)
  } catch (err) {
    const code = nextErrorCode(err)
    if (code === 'E263') return
    if (code !== 'E872') throw err
    try {
      revalidateTag(tag, { expire: 0 })
    } catch (inner) {
      if (nextErrorCode(inner) === 'E263') return
      throw inner
    }
  }
}
