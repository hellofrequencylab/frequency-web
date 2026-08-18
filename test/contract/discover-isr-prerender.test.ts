import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ISR needs BOTH halves (LIVE-011). A dynamic route that declares `revalidate` but
// never exports `generateStaticParams` produces no entry in the prerender manifest,
// so nothing is ever prerendered and nothing is ever revalidated: the declaration is
// inert and every crawl pays a cold render. It failed silently for four /discover
// detail routes because the only visible signal was the `revalidate` line itself,
// which looked correct. This is the gate that notices.
//
// The rule is one-directional. `revalidate` ⇒ `generateStaticParams`; a dynamic route
// with neither is a deliberate always-dynamic route and is left alone.

const DISCOVER = fileURLToPath(new URL('../../app/discover', import.meta.url))

function dynamicPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) dynamicPages(full, acc)
    else if (entry === 'page.tsx' && full.includes('[')) acc.push(full)
  }
  return acc
}

describe('/discover dynamic routes', () => {
  const pages = dynamicPages(DISCOVER)

  it('finds the dynamic detail routes', () => {
    expect(pages.length).toBeGreaterThan(5)
  })

  it('never declares revalidate without generateStaticParams', () => {
    const inert = pages.filter((p) => {
      const src = readFileSync(p, 'utf8')
      return /^export const revalidate\b/m.test(src) && !src.includes('generateStaticParams')
    })
    expect(inert.map((p) => p.slice(DISCOVER.length + 1))).toEqual([])
  })
})
