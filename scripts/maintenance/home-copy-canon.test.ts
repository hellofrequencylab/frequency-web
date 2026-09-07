// LIVE-148 — the front-door copy guard.
//
// WHAT THESE TESTS ARE FOR. The guard reads production, so CI can never exercise its real
// input. What CI CAN pin is everything between the query and the report: that the SQL is
// the one the reader expects, that extraction reaches copy at every nesting depth the real
// document actually uses, that machinery is not mistaken for prose, and that a violation is
// caught rather than passed over.
//
// 🔴 THE FIXTURES MIRROR THE REAL DOCUMENT'S SHAPE, taken from the live `pages` row on
// 2026-09-07: 13 blocks, copy living at `content[].props.{title,subtitle,body,kicker,
// eyebrow,footnote,safetyNet}` and, nested one level deeper, at `rows[].note`,
// `rungs[].blurb` and `items[].text`. A fixture that only nested one level would pass while
// the guard missed a third of the front door.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RULES } from '../check-canon.mjs'
import { query, proseStrings, isCopy, findings, report, SLUG } from './home-copy-canon.mjs'

/** A miniature of the live home document: same keys, same nesting depths. */
const CLEAN_DOC = {
  root: { props: {} },
  zones: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'home-hero',
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
        title: 'Frequency exists to create and support healthy community',
        subtitle: 'Frequency is community you build where you live.',
        eyebrow: 'Frequency',
        variant: 'image',
        ctaPrimaryHref: '/join',
        ctaPrimaryLabel: 'JOIN THE BETA',
        layout: { spaceTop: 'default', visibility: 'all' },
      },
    },
    {
      type: 'CircleFirstNight',
      props: {
        id: 'home-first-night',
        rows: [
          { time: '0:00', title: 'Arrive and settle', note: 'Tea, a folding chair, names around the room' },
          { time: '0:15', title: 'Open the week', note: 'The host reads the prompt the Journey set for tonight.' },
        ],
      },
    },
    {
      type: 'RolesPath',
      props: {
        id: 'home-roles',
        rungs: [{ name: 'Member', blurb: 'You show up to a Circle. That is the whole entry fee.' }],
      },
    },
    {
      type: 'Marquee',
      props: { id: 'home-marquee', items: [{ text: 'Find a few neighbors' }] },
    },
  ],
}

function withCopy(text: string) {
  return {
    root: { props: {} },
    content: [{ type: 'Text', props: { id: 'home-x', body: text } }],
  }
}

describe('home-copy-canon — the SQL', () => {
  it('reads published_data for the home slug and nothing else', () => {
    const q = query()
    expect(q).toContain('public.pages')
    expect(q).toContain("slug = 'home'")
    expect(q).toContain('published_data is not null')
    expect(SLUG).toBe('home')
  })

  it('is a single read-only statement', () => {
    const q = query().toLowerCase()
    for (const forbidden of ['insert', 'update ', 'delete', 'drop', 'alter', 'truncate', 'grant']) {
      expect(q, `the maintenance query must never ${forbidden}`).not.toContain(forbidden)
    }
    expect(q.split(';').filter((s) => s.trim()).length).toBe(1)
  })
})

describe('home-copy-canon — extraction', () => {
  it('reaches copy at every depth the live document uses', () => {
    const found = proseStrings(CLEAN_DOC).map((s) => s.text)
    // top-level props
    expect(found).toContain('Frequency exists to create and support healthy community')
    expect(found).toContain('Frequency is community you build where you live.')
    // nested one level deeper — rows[].note, rungs[].blurb, items[].text
    expect(found).toContain('Tea, a folding chair, names around the room')
    expect(found).toContain('You show up to a Circle. That is the whole entry fee.')
    expect(found).toContain('Find a few neighbors')
  })

  it('does not mistake machinery for copy', () => {
    const found = proseStrings(CLEAN_DOC).map((s) => s.text)
    expect(found).not.toContain('home-hero') // an id
    expect(found).not.toContain('/join') // an href
    expect(found).not.toContain('/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg') // an asset
    expect(found).not.toContain('image') // a variant token
    expect(found).not.toContain('0:00') // a time figure
  })

  it('classifies borderline strings deliberately', () => {
    expect(isCopy('Hold the door')).toBe(true)
    expect(isCopy('JOIN THE BETA')).toBe(true) // shouty, but it is copy a member reads
    expect(isCopy('surface')).toBe(false) // a bare token
    expect(isCopy('#ffcc00')).toBe(false)
    expect(isCopy('https://example.com/x')).toBe(false)
    expect(isCopy('a')).toBe(false)
    expect(isCopy('home-hero', '$.content[0].props.id')).toBe(false) // machinery by key
  })
})

describe('home-copy-canon — the rules actually fire', () => {
  // NEGATIVE CONTROL: this is the test that stops the guard from being a gate that has
  // never fired. Every rule the canon defines is exercised against copy that violates it.
  it.each(RULES.map((r) => [r.name, r] as const))('catches %s', (_name, rule) => {
    const sample = SAMPLES[rule.name]
    expect(sample, `no sample copy for rule "${rule.name}" — add one or the rule is unproven here`).toBeDefined()
    const { out } = findings(withCopy(sample!))
    expect(out.map((f) => f.rule)).toContain(rule.name)
  })

  it('POSITIVE CONTROL: passes the real front-door voice', () => {
    const { out, strings } = findings(CLEAN_DOC)
    expect(strings.length).toBeGreaterThan(5)
    expect(out).toEqual([])
  })

  it('reports the path so an operator can find the block', () => {
    const { out } = findings(withCopy('We are on the same wavelength'))
    expect(out[0]?.path).toContain('content[0].props.body')
  })
})

describe('home-copy-canon — the report', () => {
  it('names an empty result rather than reading as coverage', () => {
    const { text, count } = report([])
    expect(count).toBe(0)
    expect(text).toContain('No published `home` document found')
    expect(text).toMatch(/would read as coverage/)
  })

  it('says what to do about a finding, and where', () => {
    const { text, count } = report([{ slug: 'home', doc: JSON.stringify(withCopy('find your tribe')) }])
    expect(count).toBe(1)
    expect(text).toContain('find your tribe')
    expect(text).toContain('/pages/home')
  })

  it('survives a document that is not JSON', () => {
    const { text } = report([{ slug: 'home', doc: '{not json' }])
    expect(text).toContain('did not parse')
  })
})

describe('home-copy-canon — wiring', () => {
  it('is invoked by the maintenance workflow, both halves', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/maintenance.yml'), 'utf8')
    expect(wf).toContain('home-copy-canon.mjs --print-query')
    expect(wf).toContain('scripts/maintenance/home-copy-canon.mjs home.json')
  })

  it('degrades to the loud skip its siblings use when the token is absent', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/maintenance.yml'), 'utf8')
    const step = wf.slice(wf.indexOf('Front-door copy canon'))
    expect(step).toContain('if [ -z "$SUPABASE_ACCESS_TOKEN" ]')
    expect(step).toContain('GITHUB_STEP_SUMMARY')
  })

  it('imports the canon rather than restating it', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/maintenance/home-copy-canon.mjs'), 'utf8')
    expect(src).toContain("import { RULES } from '../check-canon.mjs'")
    // A second copy of the regexes here would be a second source of truth.
    expect(src).not.toMatch(/pay\[-\\s\]\?it/)
  })
})

/** Copy that violates each rule by name. Keyed so a NEW rule fails the each-test loudly. */
const SAMPLES: Record<string, string> = {
  'em-dash in brand copy': 'Community you build — where you live',
  'lowercase "zaps" (proper noun Zaps)': 'You earn zaps for showing up',
  'lowercase "gems" (proper noun Gems)': 'Spend your gems on the good stuff',
  '"cohort" (member word is "Run")': 'Join the spring cohort near you',
  '"broadcast" as a NOUN (the member-facing noun is Dispatch)': 'Read the latest broadcasts from your Space',
  'retired "pay-it-forward" money model': 'A pay-it-forward model keeps it going',
  'retired "memberships fund the rooms"': 'Memberships fund the rooms you meet in',
  'retired "keeps the rooms open"': 'Your membership keeps the rooms open',
  'breaks promise #1 ("cut on what you sell")': 'We take a small cut only on what you sell',
  'false "lowest fee on the platform"': 'The lowest fee on the platform, guaranteed',
  'retired tagline "a place to be human"': 'Frequency is a place to be human',
  'retired "one price, five doors"': 'One price, five doors into the community',
  'retired "flat 3%" take-rate': 'We charge a flat 3% and nothing else',
  'banned "find your tribe"': 'Come find your tribe in your own town',
  'banned "on the same wavelength"': 'Neighbors who are on the same wavelength',
}
