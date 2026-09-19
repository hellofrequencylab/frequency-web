import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// SCAN-637: sitemap-advertised marketplace details must not force-dynamic, and must not
// read auth/cookies during render. One dynamic API in the page voids ISR the way the
// old /discover header did. The (main) layout auth read is a separate row (SCAN-641).

const PAGES = [
  'app/(main)/market/[id]/page.tsx',
  'app/(main)/store/[id]/page.tsx',
  'app/(main)/housing/[id]/page.tsx',
  'app/(main)/classifieds/[id]/page.tsx',
] as const

const DYNAMIC_APIS = [
  { name: 'force-dynamic', re: /export const dynamic\s*=\s*['"]force-dynamic['"]/ },
  { name: 'getCallerProfile', re: /\bgetCallerProfile\s*\(/ },
  { name: 'getMyProfileId', re: /\bgetMyProfileId\s*\(/ },
  { name: 'isPlatformStaff', re: /\bisPlatformStaff\s*\(/ },
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
})
