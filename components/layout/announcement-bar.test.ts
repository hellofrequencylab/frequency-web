import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 THE REGRESSION THIS FILE EXISTS FOR (2026-08-26).
//
// The announcement strip was a hardcoded beta notice - "Frequency will be in Beta until September
// 1st. Feel free to browse around, make some friends, and please report any bugs!" - and it was
// mounted in FIVE places: the member shell, the marketing tree, the help centre, /discover, and the
// signed-out public Space twins. Four of those five are PUBLIC and indexable. So an operational
// notice aimed at members was the first line under the header on every page a stranger or a crawler
// could reach, and it went on saying "Beta until September 1st" for as long as nobody redeployed.
//
// Two rules came out of it, and this file holds both to the source:
//   1. The bar carries no sentence of its own. The operator writes the words.
//   2. It mounts in the signed-in shell and nowhere else.
//
// Source-shape assertions, deliberately. The thing that went wrong was WHERE a component was
// mounted and WHETHER it held a literal - neither is observable from rendering the component, which
// is exactly why rendering it caught nothing for the two weeks this was live.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf8')

const BAR = read('components/layout/announcement-bar.tsx')

/** 🔴 THE ASSERTIONS BELOW HAD TO LEARN USE FROM MENTION, AND THE FIRST DRAFT DID NOT.
 *
 *  "The bar contains no beta copy" and "the bar has no ALERT_KEY" both failed on their first run -
 *  against a bar that has neither - because the file's own header EXPLAINS the beta strip and names
 *  the constant it replaced. A probe that cannot tell a mention from a use pressures the next person
 *  to delete the history in order to go green (ADR-1165 records the same defect in a backlog probe
 *  the same week). So the two copy assertions read the code with comments stripped, and everything
 *  else reads the whole file.
 *
 *  Line comments are stripped after block comments; there is no `//` inside a string literal in this
 *  file (Tailwind's `primary/80` is a single slash), and a URL appearing in one would be the thing to
 *  re-check if this ever behaves oddly. */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const BAR_CODE = stripComments(BAR)

/** Every layout that renders page chrome. If a new one appears it is covered by default: the test
 *  reads the file and asks whether it mounts the bar, so an unlisted PUBLIC layout can only fail
 *  this by being added to the list, which is the moment someone has to think about it. */
const PUBLIC_LAYOUTS = [
  'app/(marketing)/layout.tsx',
  'app/discover/layout.tsx',
  'app/(help)/layout.tsx',
]

describe('the announcement bar never reaches a public surface', () => {
  it.each(PUBLIC_LAYOUTS)('%s does not mount it', (path) => {
    expect(
      read(path),
      `${path} is a PUBLIC tree. An announcement bar here is an operational notice served to ` +
        'visitors and indexed by Google, which is the 2026-08 beta-strip regression exactly.',
    ).not.toMatch(/AnnouncementBar|SiteAlertBar/)
  })

  it('the signed-out public-twin branch of the member layout does not mount it either', () => {
    // (main)/layout.tsx serves BOTH the member shell and a logged-out "public twin" of a Space page.
    // The bar belongs to the first and not the second, and they live in one file - so the guard is
    // that the only mention sits in the AppShell call, not in the early-return branch above it.
    const layout = read('app/(main)/layout.tsx')
    const marker = '<MarketingHeader'
    const twinStart = layout.indexOf(marker)
    expect(twinStart, 'the public-twin branch is gone or restructured; re-derive this guard').toBeGreaterThan(-1)
    const twinBranch = layout.slice(twinStart, layout.indexOf('</>', twinStart))
    expect(
      twinBranch,
      'the signed-out twin branch mounts the announcement bar. That branch renders for visitors.',
    ).not.toContain('AnnouncementBar')
  })

  it('is mounted through the shell slot, so signed-in is structural rather than remembered', () => {
    expect(read('app/(main)/layout.tsx')).toMatch(/banner=\{/)
    expect(read('components/layout/app-shell.tsx')).toContain('{!editorTakeover && banner}')
  })
})

describe('the bar holds no copy of its own', () => {
  it('says nothing about a beta', () => {
    expect(
      BAR_CODE,
      'beta copy is back in the component. It outlives whatever it describes: that is how "Beta ' +
        'until September 1st" survived the beta.',
    ).not.toMatch(/beta/i)
  })

  it('renders the message it is handed and nothing else', () => {
    expect(BAR).toContain('{message}')
  })

  it('renders nothing at all for an empty message', () => {
    // The DARK-UNTIL-SET promise. `announcementBannerState()` already returns null for a blank
    // message; this is the second lock, so a caller that passes '' cannot paint an empty strip.
    expect(BAR).toMatch(/if \(hidden \|\| !message\.trim\(\)\) return null/)
  })

  it('keys dismissal to the message, not to a constant someone has to remember to bump', () => {
    // The predecessor used ALERT_KEY, hand-bumped. Forget the bump and the NEW announcement is
    // hidden from everyone who dismissed the old one - silently, and only for them.
    expect(BAR_CODE).not.toContain('ALERT_KEY')
    expect(BAR).toMatch(/keyFor\(message\)/)
  })
})
