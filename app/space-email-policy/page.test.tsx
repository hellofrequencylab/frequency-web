import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import SpaceEmailPolicyPage, { metadata } from './page'
import { SPACE_FUNCTIONS } from '@/lib/spaces/functions'

// THE SPACE EMAIL AUP IS A DRAFT FOR COUNSEL, AND IT SAYS WHAT THE CODE DOES (LIVE-707, ADR-1658).
//
// Two ways this page goes wrong, and both are quiet:
//   1. It reads as live policy. Owner ruling OWN-085 was "Draft the AUP for review": the draft exists
//      so a lawyer can read it, and the Turn on email card must not link it as if it were final.
//      So: noindex, no sitemap entry, no link from anywhere in app/, components/ or lib/, and a
//      draft banner at the top.
//   2. It promises a rule the code does not keep. A policy that says 500 a day while the backbone
//      sends 1,000 is worse than no policy. The numbers and the default sender role are read from
//      the modules that enforce them.

// FocusTemplate's page admin bar reads the pathname; outside a Next request there is none.
vi.mock('next/navigation', () => ({ usePathname: () => '/space-email-policy' }))

const PAGE_DIR = 'app/space-email-policy'
const ROUTE = 'space-email-policy'

const html = renderToStaticMarkup(SpaceEmailPolicyPage())
const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ')

/** Source with comments removed, so a comment that names the draft is not mistaken for a link. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mjs|txt|md)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('Space email AUP draft: never presented as live policy', () => {
  it('asks not to be indexed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('is not in the sitemap', () => {
    expect(readFileSync('app/sitemap.ts', 'utf8')).not.toContain(ROUTE)
  })

  it('opens with the draft banner and closes with the questions for counsel', () => {
    expect(text).toContain('DRAFT. Not in force, and no lawyer has read it yet.')
    expect(text.indexOf('DRAFT. Not in force')).toBeLessThan(text.indexOf('1. What this covers'))
    expect(text).toContain('For counsel: open questions.')
  })

  it('is linked from nowhere in the product, least of all the Turn on email card', () => {
    const card = code('components/spaces/email/email-enable-card.tsx')
    expect(card).not.toContain(ROUTE)
    const linkers = ['app', 'components', 'lib']
      .flatMap((d) => walk(d))
      .filter((p) => !p.startsWith(PAGE_DIR))
      .filter((p) => code(p).includes(`/${ROUTE}`))
    expect(linkers).toEqual([])
  })

  it('has no em or en dash (CONTENT-VOICE)', () => {
    expect(text).not.toMatch(/[–—]/)
  })
})

describe('Space email AUP draft: every number is the one the code enforces', () => {
  it('states the daily cap lib/spaces/email.ts enforces', () => {
    const m = /export const DAILY_SEND_CAP = ([\d_]+)/.exec(readFileSync('lib/spaces/email.ts', 'utf8'))
    expect(m).not.toBeNull()
    const cap = Number(m![1].replace(/_/g, ''))
    expect(text).toContain(`up to ${cap.toLocaleString('en-US')} emails a day, counted from midnight UTC`)
  })

  it('states the complaint line the Email panel warns at', () => {
    const m = /const COMPLAINT_CEILING = ([\d.]+)/.exec(
      readFileSync('components/spaces/email/analytics-panel.tsx', 'utf8'),
    )
    expect(m).not.toBeNull()
    const pct = `${Number(m![1]) * 100}%`
    expect(text).toContain(`spam complaints go above ${pct}`)
  })

  it('names the default sender roles the email function grants', () => {
    const email = SPACE_FUNCTIONS.find((f) => f.key === 'email')
    expect(email?.defaultMinRole).toBe('admin')
    expect(text).toContain("By default that is the Space's owner or an admin")
  })

  it('says an import is not permission, which is what the import path writes', () => {
    expect(readFileSync('lib/crm/import/commit.ts', 'utf8')).toMatch(/consent_state: 'unknown'/)
    expect(text).toContain('Contacts you import start as not opted in')
  })
})
