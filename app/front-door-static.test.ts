import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE FRONT DOOR RENDERS STATICALLY.
//
// `app/page.tsx` is `/` — the only `priority: 1` entry in the sitemap, the entity anchor for the
// whole Organization/WebSite graph, and the URL every crawler and every AI answer engine reaches
// first. Until 2026-09-05 it awaited `createClient()` + `auth.getUser()` for a single boolean, and
// `createClient` calls `cookies()`. One request-time API opts the entire route out of static
// rendering — silently, with no build warning and no runtime error — so every anonymous visit and
// every crawl re-ran the full query set (three menu reads = 13 queries, then the published
// document) on demand.
//
// That is LIVE-012 reproduced on the highest-value URL on the site. `app/discover` fixed it and
// got `app/discover/static-render.test.ts`; `app/(marketing)` fixed it and wrote the reasoning
// into its layout. `app/page.tsx` belongs to NEITHER group, so neither guard covered it and the
// defect survived both passes. This file is the missing third guard.
//
// It measures the CONSEQUENCE, not the fix: it does not check that one specific `getUser` call is
// gone, it checks that the front door reads no request data at all and still declares its
// `revalidate`. Re-adding the read tomorrow fails here the day it is written, rather than after
// someone notices the TTFB.
//
// The auth-dependent chrome is not lost: `MarketingHeader` takes `detectClientAuth` and upgrades
// the logo link and nav mode from the local session cookie after hydration, with no network call.
// The page body and every byte of SEO output are identical for signed-in and signed-out viewers,
// which is what makes the page cacheable at all.

const FRONT_DOOR = 'app/page.tsx'

const DYNAMIC_APIS = [
  { name: 'supabase.auth.getUser', re: /\.auth\.getUser\s*\(/ },
  { name: 'supabase.auth.getSession', re: /\.auth\.getSession\s*\(/ },
  { name: 'createClient from lib/supabase/server', re: /from\s+['"]@\/lib\/supabase\/server['"]/ },
  { name: 'cookies()', re: /\bcookies\s*\(\s*\)/ },
  { name: 'headers()', re: /\bheaders\s*\(\s*\)/ },
  { name: 'draftMode()', re: /\bdraftMode\s*\(\s*\)/ },
  // searchParams is a prop, not a call, but reading it is equally disqualifying: a page that
  // destructures it is dynamic for the same reason.
  { name: 'searchParams', re: /\bsearchParams\b/ },
]

describe('the front door renders statically', () => {
  const src = readFileSync(FRONT_DOOR, 'utf8')

  it('is a real page, so a rename cannot make this gate vacuous', () => {
    // ADR-970: a guard that passes by not looking reads as coverage. If app/page.tsx moves, this
    // must fail loudly rather than quietly checking an empty string.
    expect(src.length).toBeGreaterThan(500)
    expect(src).toMatch(/export default async function/)
  })

  it('declares an ISR revalidate', () => {
    expect(src, `${FRONT_DOOR} must declare \`export const revalidate\``).toMatch(
      /^export const revalidate = \d+/m,
    )
  })

  it('does not force itself dynamic, or the revalidate above is a lie', () => {
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    const found = DYNAMIC_APIS.filter((a) => a.re.test(code)).map((a) => a.name)
    expect(
      found,
      `${FRONT_DOOR} reads request data (${found.join(', ')}), which silently opts the whole ` +
        `route out of static rendering. Auth-dependent chrome belongs in MarketingHeader's ` +
        `detectClientAuth, which resolves it after hydration with no network call.`,
    ).toEqual([])
  })

  it('the detector actually fires (positive control)', () => {
    const planted = 'const supabase = await createClient()\nawait supabase.auth.getUser()'
    expect(DYNAMIC_APIS.some((a) => a.re.test(planted))).toBe(true)
  })
})
