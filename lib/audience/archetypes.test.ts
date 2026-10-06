// LIVE-795 (ADR-1715): the archetype registry, the arrival follow-up, and the no-pixel rule.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARCHETYPE_IDS, ARCHETYPES, FOLLOW_UPS, archetypeTag, followUpsFor, resolveArchetype } from './archetypes'
import { TRAIT_REGISTRY } from '@/lib/traits/registry'
import { PERSONA_ORDER } from '@/lib/onboarding/personas'
import { ARCHETYPE_NAME_RE } from '../../scripts/check-canon.mjs'

const ROOT = join(__dirname, '..', '..')

describe('archetype registry', () => {
  it('holds the eleven archetypes from CONTENT-VOICE §2d and §2f', () => {
    expect(ARCHETYPE_IDS).toHaveLength(11)
    const canon = readFileSync(join(ROOT, 'docs/CONTENT-VOICE.md'), 'utf8')
    for (const id of ARCHETYPE_IDS) expect(canon, id).toContain(ARCHETYPES[id].internalName.replace('Activity-First', 'Activity-First Man'))
  })

  it('registers one tag per archetype, so assignTag never throws on an answer', () => {
    const keys = new Set(TRAIT_REGISTRY.map((t) => t.key))
    for (const id of ARCHETYPE_IDS) expect(keys.has(archetypeTag(id)!), id).toBe(true)
  })

  it('every archetype is reachable from exactly one follow-up option, under a real persona', () => {
    const reached = Object.entries(FOLLOW_UPS).flatMap(([persona, opts]) => {
      expect(PERSONA_ORDER as string[]).toContain(persona)
      return opts.map((o) => o.archetype)
    })
    expect(new Set(reached).size).toBe(reached.length)
    expect([...reached].sort()).toEqual([...ARCHETYPE_IDS].sort())
  })

  it('options are in members’ own words and never name an archetype', () => {
    for (const opts of Object.values(FOLLOW_UPS)) {
      for (const o of opts) expect(ARCHETYPE_NAME_RE.test(o.label), o.label).toBe(false)
    }
  })

  it('resolves an answer only under the persona it was asked for (skipping and stale answers are null)', () => {
    expect(resolveArchetype('visitor', 'transplant')).toBe('transplant')
    expect(resolveArchetype('builder', 'host_connector')).toBe('host_connector')
    expect(resolveArchetype('visitor', 'studio_keeper')).toBeNull()
    expect(resolveArchetype('visitor', null)).toBeNull()
    expect(resolveArchetype('visitor', 'not_a_thing')).toBeNull()
    expect(followUpsFor('investor')).toEqual([])
  })
})

describe('no pixel ever carries an archetype (ADR-1715 privacy rule)', () => {
  // Any track()/gtag/fbq/dataLayer/posthog call in a file that touches the archetype must not pass it.
  const SINKS = /\b(track|gtag|fbq|posthog\.capture|sendGAEvent)\s*\(|dataLayer\.push\s*\(/g
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(ROOT, dir))) {
      const p = `${dir}/${name}`
      if (statSync(join(ROOT, p)).isDirectory()) { if (name !== 'node_modules') walk(p, out) }
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
    }
    return out
  }
  function calls(src: string): string[] {
    const out: string[] = []
    for (const m of src.matchAll(SINKS)) {
      let depth = 0
      let i = (m.index ?? 0) + m[0].length - 1
      const start = i
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++
        else if (src[i] === ')' && --depth === 0) break
      }
      out.push(src.slice(start, i + 1))
    }
    return out
  }
  it('finds the files that read the archetype, and none passes it to an analytics or ad sink', () => {
    const files = ['app', 'lib', 'components'].flatMap((d) => walk(d)).filter((f) => /archetype/i.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(files.length).toBeGreaterThan(3)
    for (const f of files) {
      const code = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      for (const c of calls(code)) expect(c, `${f}: ${c.slice(0, 80)}`).not.toMatch(/archetype/i)
    }
  })
})
