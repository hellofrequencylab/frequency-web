import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// LIVE-012: /discover is the only indexable community surface, and every page under it declares
// `export const revalidate = 3600`. That declaration is a REQUEST, not a guarantee — one dynamic
// API anywhere in the render opts the whole route out of static rendering, silently, with no
// build warning and no runtime error. Six of these pages awaited `supabase.auth.getUser()` for a
// single boolean, so all six paid two auth round trips plus their full query set on every crawl
// and every visit, while the `revalidate` line above them said otherwise.
//
// THIS TEST MEASURES THE CONSEQUENCE, not the fix. It does not check that the six specific reads
// are gone; it checks that no page under app/discover reads auth or cookies at all, which is the
// property that keeps the ISR promise true. A seventh page added tomorrow with the same pattern
// fails here on the day it is written rather than after a Lighthouse run notices the TTFB.
//
// app/discover/layout.tsx already holds the other half of this contract (`authMode="client"` on
// SiteHeader, with its own comment saying why), so the layout is in scope here too.

const ROOT = 'app/discover'

// Dynamic APIs that force a route out of static rendering. `headers()` and `draftMode()` are
// listed even though nothing here calls them: the point is the class of mistake, not the roster
// of today's instances.
const DYNAMIC_APIS = [
  { name: 'supabase.auth.getUser', re: /\.auth\.getUser\s*\(/ },
  { name: 'supabase.auth.getSession', re: /\.auth\.getSession\s*\(/ },
  { name: "createClient from lib/supabase/server", re: /from\s+['"]@\/lib\/supabase\/server['"]/ },
  { name: 'cookies()', re: /\bcookies\s*\(\s*\)/ },
  { name: 'headers()', re: /\bheaders\s*\(\s*\)/ },
  { name: 'draftMode()', re: /\bdraftMode\s*\(\s*\)/ },
]

function pages(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) pages(p, out)
    else if (/^(page|layout)\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

describe('/discover renders statically', () => {
  const files = existsSync(ROOT) ? pages(ROOT) : []

  it('finds the pages it is meant to guard (a scan of nothing must not read as a pass)', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it.each(files)('%s reaches for no dynamic API', (file) => {
    const src = readFileSync(file, 'utf8')
    // Comments are where this contract is EXPLAINED, so they must not be read as violations —
    // app/discover/layout.tsx spends a paragraph on `cookies()` to say why it does not call it.
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    const found = DYNAMIC_APIS.filter((d) => d.re.test(code)).map((d) => d.name)
    expect(found, `${file} would be force-dynamic, voiding its \`revalidate\``).toEqual([])
  })

  it('every page still asks for ISR, so the property above is worth something', () => {
    const withoutRevalidate = files
      .filter((f) => f.endsWith('page.tsx'))
      .filter((f) => !/export const revalidate\s*=/.test(readFileSync(f, 'utf8')))
    expect(withoutRevalidate).toEqual([])
  })
})
