import { NextResponse } from 'next/server'
import { searchSiteIcons } from '@/lib/loom/site-icons'
import { SITE_ICON_MAX_LIMIT, type SiteIcon } from '@/lib/loom/site-icons-client'

// GET /api/site-icons?q=&limit= — the Loom picker's Icons view (docs/ICONS.md §Loom, ADR-505).
//
// 🔴 WHY A ROUTE AND NOT A SERVER ACTION (ADR-1002 follow-up, docs/DEPLOY-SAFETY.md rule 2).
// The search needs ~7MB of @iconify-json glyph data. As a `'use server'` action it was imported by
// components/loom/loom-picker.tsx, a CLIENT module rendered by uploaders all over the app, so the
// 7MB was copied into every serverless function that could open the picker: 6.87MB x 337 functions
// = 2.3GB of the build's disk budget, for a dataset one popup tab reads. A route handler is its own
// function, so the data lands HERE and nowhere else. Keep it that way: nothing outside this file
// and components/ui/icon.tsx may import the collections. scripts/build-fanout.test.ts enforces it.
//
// PUBLIC on purpose, and safe: it reads nothing but the installed icon packages — no database, no
// session, no caller input beyond a substring and a page size, and every response is identical for
// every visitor. `limit` is clamped and `q` is truncated so a crafted request cannot make the
// search walk the sets more than once.
export const runtime = 'nodejs'

/** Longest query we will match on. Glyph names are short; anything longer is not a search. */
const MAX_QUERY = 64

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').slice(0, MAX_QUERY)
  const asked = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(asked)
    ? Math.min(Math.max(asked, 1), SITE_ICON_MAX_LIMIT)
    : 60

  const icons: SiteIcon[] = await searchSiteIcons(q, limit)

  // The sets are build-time constants, so the answer to a given query cannot change until the next
  // deploy. Cache it hard at the edge and briefly in the browser: the round-trip the picker now
  // pays on first open is paid once per query per deploy, not once per open.
  return NextResponse.json(
    { icons },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
