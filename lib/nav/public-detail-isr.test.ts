import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// SCAN-637 + SCAN-636 + SCAN-643: sitemap-advertised public details must not
// force-dynamic, and must not read auth/cookies during render. One dynamic API
// in the page or a parent layout voids ISR the way the old /discover header did.
// Share event and listing URLs live under (public). /events/<slug> is the share
// URL; signed-in members rewrite to event-member-page.tsx.

const PAGES = [
  'app/(public)/market/[id]/page.tsx',
  'app/(public)/store/[id]/page.tsx',
  'app/(public)/housing/[id]/page.tsx',
  'app/(public)/classifieds/[id]/page.tsx',
  'app/(public)/events/[slug]/page.tsx',
  'app/spotlight/[handle]/page.tsx',
] as const

const DYNAMIC_APIS = [
  { name: 'force-dynamic', re: /export const dynamic\s*=\s*['"]force-dynamic['"]/ },
  { name: 'getCallerProfile', re: /\bgetCallerProfile\s*\(/ },
  { name: 'getMyProfileId', re: /\bgetMyProfileId\s*\(/ },
  { name: 'isPlatformStaff', re: /\bisPlatformStaff\s*\(/ },
  { name: 'createClient', re: /\bcreateClient\s*\(/ },
  { name: 'cookies()', re: /\bcookies\s*\(\s*\)/ },
  { name: 'headers()', re: /\bheaders\s*\(\s*\)/ },
]

function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

describe('sitemap-advertised listing details stay eligible for ISR', () => {
  it.each(PAGES)('%s exists', (file) => {
    expect(existsSync(file), file).toBe(true)
  })

  it.each(PAGES)('%s asks for ISR', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/export const revalidate\s*=\s*3600/)
  })

  it.each(PAGES)('%s reaches for no dynamic API', (file) => {
    const found = DYNAMIC_APIS.filter((d) => d.re.test(codeOf(file))).map((d) => d.name)
    expect(found, `${file} would stay force-dynamic`).toEqual([])
  })

  it('the (public) share layout never calls a dynamic request API', () => {
    const layout = codeOf('app/(public)/layout.tsx')
    const chrome = codeOf('components/layout/public-share-chrome.tsx')
    for (const src of [layout, chrome]) {
      expect(src).not.toMatch(/\bcookies\s*\(\s*\)/)
      expect(src).not.toMatch(/\bheaders\s*\(\s*\)/)
      expect(src).not.toMatch(/\bgetCachedUser\s*\(/)
    }
    expect(chrome).toMatch(/<SiteHeader[\s\S]*authMode="client"/)
    expect(chrome).not.toMatch(/<MarketingHeader/)
  })

  it('sitemap lists Spotlight handles through the shared reader, not a local admin query', () => {
    const sitemap = readFileSync('app/sitemap.ts', 'utf8')
    expect(sitemap).toMatch(/listPublishedSpotlightHandles/)
    expect(sitemap).not.toMatch(/createAdminClient/)
    const data = readFileSync('lib/spotlight/data.ts', 'utf8')
    expect(data).toMatch(/export async function listPublishedSpotlightHandles/)
    expect(data).toMatch(/meta->spotlight->>published/)
  })
})
