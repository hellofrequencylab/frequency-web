import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteBody, SiteRoot } from '@/components/frequency/site/shell/site-root'
import { resolveSitePage } from '@/lib/frequency/site-pages'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

// THE PUBLIC SHELL'S SURFACE (guidelines/site-themes.md): every public route under Frequency renders in
// the site shell, and its body is Stage (sell) or Commons (read, find, act). These pin the consequence on
// the kit root, and that each public layout reaches the shell, so a new layout cannot ship DAWN's header.

describe('the kit root carries the surface', () => {
  it('is Stage by default, with the page row unquieted', () => {
    pathname = '/pricing'
    const html = renderToStaticMarkup(<SiteRoot>x</SiteRoot>)
    expect(html).toContain('data-surface="stage"')
    expect(html).toContain('data-fx-quiet="1"') // Pricing's own row
  })

  it('takes the layout default and quiets the aura on Commons', () => {
    pathname = '/privacy'
    const html = renderToStaticMarkup(<SiteRoot surface="commons">x</SiteRoot>)
    expect(html).toContain('data-surface="commons"')
    expect(html).toContain('data-fx-quiet="2"')
  })

  it('scopes a Commons body for the shared primitives, and only a Commons one', () => {
    pathname = '/discover/events'
    const commons = renderToStaticMarkup(<SiteRoot surface="commons"><SiteBody>x</SiteBody></SiteRoot>)
    expect(commons).toContain('class="fq-body fq-commons-body"')
    pathname = '/pricing'
    const stage = renderToStaticMarkup(<SiteRoot><SiteBody>x</SiteBody></SiteRoot>)
    expect(stage).toContain('class="fq-body"')
    expect(stage).not.toContain('fq-commons-body')
  })

  it('bridges every members-kit fallback rule into the Commons body', () => {
    const css = readFileSync('app/themes/frequency/members-ui.css', 'utf8')
    const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((sel) => sel.includes(':not([data-kit] *)'))
    expect(selectors.length).toBeGreaterThan(40)
    for (const sel of selectors) expect(sel, sel.slice(0, 80)).toContain('[data-kit="site"] .fq-commons-body ')
  })

  it('lets a page row beat the layout default', () => {
    expect(resolveSitePage('/discover/events').surface).toBeUndefined()
    pathname = '/'
    const html = renderToStaticMarkup(<SiteRoot surface="commons">x</SiteRoot>)
    expect(html).toContain('data-surface="commons"') // Home has no surface: the layout's wins
  })

  // Owner, 2026-10-14: "light for articles". The Help front page is the dark Stage of Help.html; its
  // topics, articles and What's new are long reading, so Commons, in the first paint.
  it('wears Stage on the Help front page and Commons on every page below it', () => {
    for (const [path, surface] of [
      ['/help', 'stage'],
      ['/help/getting-started', 'commons'],
      ['/help/getting-started/create-an-account', 'commons'],
      ['/help/changelog', 'commons'],
    ] as const) {
      pathname = path
      expect(resolveSitePage(path).surface, path).toBe(surface)
      const html = renderToStaticMarkup(<SiteRoot>x</SiteRoot>)
      expect(html, path).toContain(`data-surface="${surface}"`)
    }
    expect(resolveSitePage('/help/changelog').cta).toEqual(resolveSitePage('/help').cta)
  })
})

describe('every public layout wears the site shell under Frequency', () => {
  const SHELLED = [
    'app/(marketing)/layout.tsx',
    'app/(help)/layout.tsx',
    'app/(public)/layout.tsx',
    'app/discover/layout.tsx',
    'app/for/layout.tsx',
  ]
  const COMMONS = [
    'app/guidelines/layout.tsx',
    'app/privacy/layout.tsx',
    'app/terms/layout.tsx',
    'app/space-email-policy/layout.tsx',
    'app/manage-emails/layout.tsx',
    'app/unsubscribe/layout.tsx',
    'app/code-unavailable/layout.tsx',
    'app/events/claim/layout.tsx',
    'app/listings/claim/layout.tsx',
    'app/spaces/claim/layout.tsx',
  ]

  it.each(SHELLED)('%s branches on SITE_DESIGN into SiteShell', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/SITE_DESIGN === 'frequency'/)
    expect(src).toMatch(/<SiteShell[\s>]/)
  })

  it.each(COMMONS)('%s is the Commons layout', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/CommonsLayout as default/)
  })

  it('the Commons layout puts the shell on Commons', () => {
    const src = readFileSync('components/frequency/site/shell/commons-layout.tsx', 'utf8')
    expect(src).toMatch(/<SiteShell surface="commons">/)
  })
})
