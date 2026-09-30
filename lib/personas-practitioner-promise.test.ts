// LIVE-709 (ADR-1675): THE PRACTITIONER PERSONA PROMISES ONLY WHAT A PRACTITIONER CAN SELL.
//
// The Practitioner card on /partners/join said "Host paywalled Programs", and the onboarding reel
// said "Spin up a program in minutes". Nothing on the platform can put a price on a Program (a
// Program is a Business Space's Channel with a Chapter blueprint, docs/NAMING.md), so a member who
// claimed the persona for that promise had nothing to sell and no tool to press (`tools: []`).
//
// This file fails if either half comes back: the retired promise in any member-facing persona
// copy, or a Practitioner card whose tools are empty or point at a page that does not exist.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PARTNER_PERSONAS, PERSONA_META } from './personas-core'
import { PERSONAS } from './onboarding/personas'
import { TRAIT_REGISTRY } from './traits/registry'
import { PAYOUT_CHANNEL_WORDS } from './billing/payout-prompt'

const ROOT = join(__dirname, '..')

/** The retired promise, in any spelling a writer is likely to reach for. */
const RETIRED = /paywall(?:ed)?\s+programs?|paid\s+programs?|programs?\s+behind\s+a\s+paywall/i

/** Every member-facing persona string: the partner cards, the intake personas, the persona tags. */
function personaCopy(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = []
  for (const p of PARTNER_PERSONAS) {
    const m = PERSONA_META[p]
    out.push({ where: `PERSONA_META.${p}.tagline`, text: m.tagline })
    out.push({ where: `PERSONA_META.${p}.unlocks`, text: m.unlocks })
    for (const t of m.tools) out.push({ where: `PERSONA_META.${p}.tools`, text: t.label })
  }
  for (const [id, persona] of Object.entries(PERSONAS)) {
    out.push({ where: `PERSONAS.${id}.pitch`, text: persona.pitch })
    out.push({ where: `PERSONAS.${id}.track.headline`, text: persona.track.headline })
    for (const s of persona.track.shows) out.push({ where: `PERSONAS.${id}.track.shows`, text: s })
    for (const r of persona.reel) {
      const slide = r as { title?: string; line?: string }
      if (slide.title) out.push({ where: `PERSONAS.${id}.reel.title`, text: slide.title })
      if (slide.line) out.push({ where: `PERSONAS.${id}.reel.line`, text: slide.line })
    }
  }
  for (const t of TRAIT_REGISTRY) {
    if (t.key.startsWith('persona_')) out.push({ where: `trait ${t.key}`, text: t.description })
  }
  return out
}

/** The Practitioner's own strings, where even the word "Program" is not a promise it can keep. */
function practitionerCopy(): Array<{ where: string; text: string }> {
  return personaCopy().filter(
    (c) => c.where.includes('.practitioner.') || c.where === 'trait persona_practitioner',
  )
}

/** Every app route with a page, route groups and private folders removed ("/events/new"). */
function appRoutes(): Set<string> {
  const routes = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (!e.name.startsWith('_') && e.name !== 'node_modules') walk(p)
      } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name)) {
        const segs = relative(join(ROOT, 'app'), dir)
          .split(sep)
          .filter((s) => s && !/^\(.*\)$/.test(s))
        routes.add('/' + segs.join('/'))
      }
    }
  }
  walk(join(ROOT, 'app'))
  return routes
}

describe('the retired "paywalled Programs" promise stays gone (LIVE-709)', () => {
  it('no persona copy promises paywalled or paid Programs', () => {
    const hits = personaCopy().filter((c) => RETIRED.test(c.text))
    expect(hits).toEqual([])
  })

  it('the Practitioner copy names no Program and no paywall at all', () => {
    const hits = practitionerCopy().filter((c) => /\bprograms?\b|paywall/i.test(c.text))
    expect(hits).toEqual([])
  })

  it('the persona canons do not carry it either', () => {
    for (const doc of ['docs/ROLES.md', 'docs/LEAD-FLOWS.md']) {
      const rows = readFileSync(join(ROOT, doc), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('|') && /practitioner/i.test(l))
      expect(rows.length, `${doc} has no Practitioner row`).toBeGreaterThan(0)
      for (const row of rows) {
        // The re-scope note may quote the retired phrase once, inside quotation marks, to say it
        // is gone; a row that PROMISES it would carry it unquoted.
        expect(row.replace(/"[^"]*"/g, ''), doc).not.toMatch(/paywall|build programs/i)
      }
    }
  })
})

describe('the Practitioner promise names only what a practitioner can sell today', () => {
  const meta = PERSONA_META.practitioner

  it('names the live money paths it promises', () => {
    // Each of these is a PayoutChannel (lib/billing/payout-prompt.ts), so a path that is retired
    // there fails here before the card can keep promising it.
    for (const channel of ['tickets', 'bookings', 'memberships', 'journeys'] as const) {
      const noun = PAYOUT_CHANNEL_WORDS[channel].noun
      expect(meta.unlocks.toLowerCase(), channel).toContain(noun.toLowerCase())
    }
    expect(meta.unlocks).toMatch(/\bMarket\b/)
    expect(meta.unlocks).not.toMatch(/—/)
  })

  it('opens real pages once the persona is verified, not an empty tool row', () => {
    expect(meta.tools.length).toBeGreaterThan(0)
    const routes = appRoutes()
    expect(routes.has('/events/new'), 'route discovery is reading the wrong tree').toBe(true)
    for (const tool of meta.tools) {
      const path = tool.href.split(/[?#]/)[0]
      expect(routes.has(path), `${tool.label} -> ${tool.href} has no page`).toBe(true)
    }
  })

  it('points at the self-serve payout setup it depends on', () => {
    expect(meta.tools.some((t) => t.href === '/settings#payouts')).toBe(true)
    expect(existsSync(join(ROOT, 'app/(main)/settings/page.tsx'))).toBe(true)
  })
})
