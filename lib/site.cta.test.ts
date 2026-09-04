import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// THE APPROVED CALL-TO-ACTION SET (ADR-1196, owner ruling 2026-09-04).
//
// The 2026-09-03 audit counted FIVE labels for one entrance: "Start a Circle" on most marketing
// pages, "Join the beta" hardcoded on the home page, "Start free" on the /for/<niche> doors, "Join
// free" / "Join Crew" / "Start a Space" on /pricing, and "Come in" at /join itself. It was wrong:
// this guard found two more on its first run — "Find your way in" on /about and "Follow the build"
// on /the-lab — so it was SEVEN. None of them disagreed with a rule, because there was no rule,
// only a default constant any page could override and three more declared elsewhere. A count made
// by reading is a lower bound; a count made by a guard is the number.
//
// The rule now is two verbs, each named for the reader it addresses, and this file is what makes it
// a rule rather than an intention:
//   SEEKER    "Find your people" -> /join      the guides, /discover, the-community, about
//   OPERATOR  "Start free"       -> /pricing   /pricing, /spaces, the /for/<niche> doors
//
// `/join` keeps its own arrival word ("Come in") and is not a call to action: it is the door, and
// the visitor is already through it. In-app member surfaces are out of scope entirely.

import { BETA_CTA_LABEL, OPERATOR_CTA_LABEL, APPROVED_CTA_LABELS, BETA_CTA_SECONDARY_LABEL } from './site'
import { FUNNEL_CTA_LABEL } from './marketing/funnel-config'

const TEMPLATES_DIR = path.join(process.cwd(), 'lib/page-editor/templates')

/** Every marketing page template, which is where the shipped CTA labels live. */
function templateFiles(): string[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(TEMPLATES_DIR, f))
}

/** Strip comments so an ADR note QUOTING a retired label does not read as the label. */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the approved CTA set', () => {
  it('is exactly two verbs, one per reader', () => {
    expect(APPROVED_CTA_LABELS).toEqual([BETA_CTA_LABEL, OPERATOR_CTA_LABEL])
    expect(new Set(APPROVED_CTA_LABELS).size).toBe(2)
    for (const label of APPROVED_CTA_LABELS) expect(label.trim().length).toBeGreaterThan(0)
  })

  it('the niche funnel doors derive their label rather than declaring a third', () => {
    // This constant used to be an independent literal 'Start free' living beside the site default.
    expect(FUNNEL_CTA_LABEL).toBe(OPERATOR_CTA_LABEL)
  })

  it('no CTA label is an em dash or carries one (CONTENT-VOICE §10)', () => {
    for (const label of [...APPROVED_CTA_LABELS, BETA_CTA_SECONDARY_LABEL]) {
      expect(label.includes('—')).toBe(false)
      expect(label.includes('–')).toBe(false)
    }
  })

  it('the secondary path does not diminish the reader who takes it', () => {
    // It read "or just join as a member" under every primary on the site, including the guides whose
    // readers had searched for help making friends. The word `just` is the whole finding.
    expect(/\bjust\b/i.test(BETA_CTA_SECONDARY_LABEL)).toBe(false)
  })

  it('NO retired CTA label ships in any marketing template', () => {
    // The five the audit found, minus the two that survive as the approved set. `Start a Circle` is
    // retired as a CTA and stays perfectly good as prose, so this looks only at label positions.
    const retired = ['Start a Circle', 'Join the beta']
    const offenders: string[] = []
    for (const file of templateFiles()) {
      const src = strip(readFileSync(file, 'utf8'))
      for (const label of retired) {
        const asCta = new RegExp(`cta(Primary|Secondary)?Label:\\s*['"\`]${label}['"\`]`, 'i')
        if (asCta.test(src)) offenders.push(`${path.basename(file)} -> ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // ONE named exception, and it is not an acquisition CTA at all. /the-lab sells a physical space
  // planned for 2028 and its own hero says "Nothing here is bookable"; its primary asks you to
  // FOLLOW a build, pointing at /subscribe. Putting "Find your people" there would promise a room
  // that does not exist. Named here rather than allowed silently, and scoped to the one file, so a
  // second page cannot quietly inherit the exemption.
  const NOT_ACQUISITION = new Map([['the-lab.ts', 'Follow the build']])

  it('every literal CTA label in a marketing template is one of the approved set', () => {
    // A template may compute a label or take one from its spec; this catches the hardcoded case,
    // which is how five of the seven original labels got there. The guard found two the audit had
    // missed on its first run: about.ts and the-lab.ts.
    const approved = new Set<string>([...APPROVED_CTA_LABELS, 'Come in', ''])
    const offenders: string[] = []
    for (const file of templateFiles()) {
      const src = strip(readFileSync(file, 'utf8'))
      const base = path.basename(file)
      for (const m of src.matchAll(/ctaPrimaryLabel:\s*['"`]([^'"`]*)['"`]/g)) {
        if (approved.has(m[1])) continue
        if (NOT_ACQUISITION.get(base) === m[1]) continue
        offenders.push(`${base} -> "${m[1]}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the one exception is still the one exception', () => {
    // A ratchet on the exemption itself: it may shrink, never grow, without someone editing this.
    expect([...NOT_ACQUISITION.keys()]).toEqual(['the-lab.ts'])
    const lab = readFileSync(path.join(TEMPLATES_DIR, 'the-lab.ts'), 'utf8')
    expect(lab.includes("ctaPrimaryHref: '/subscribe'")).toBe(true)
  })
})
