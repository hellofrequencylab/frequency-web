import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { NOTIFICATION_CATEGORIES, type NotificationChannel } from '@/lib/notification-preferences'
import { WIRED_PREFERENCE_CHANNELS, isPreferenceWired, wiredCategories } from './wired'

// The coverage test the decorative-control audit asked for (meta-scan B9, 2026-09-04): a control
// is only honest if something reads it, so this walks the tree for every READER of a
// `<channel>_<category>` preference and holds lib/notifications/wired.ts to what it finds.
//
// Four kinds of reader exist today, and the detector below knows all four:
//   1. a literal gate call      — shouldSend(id, 'email', 'events') / resolveSendGate(id, 'push', …)
//   2. a push send              — sendPushToProfile(id, payload, 'practice') (the gate runs inside)
//   3. a direct column read     — prefs.inapp_practice
//   4. a registry row           — lib/notifications/registry.ts { category: 'dispatches', channels: ['push'] },
//                                 which the router turns into a gate call per channel
//
// It fails BOTH ways. A pair marked wired with no reader is a switch that lies; a pair marked
// unwired that something now reads is a switch that should be back on the grid. Either way the fix
// is one line in the map, in the same commit as the emitter — never a test edit.

const ROOT = path.join(__dirname, '..', '..')
const ROOTS = ['app', 'lib', 'components']
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

// Declared, not read: the model, the map, the generated types. The gate is included on purpose —
// its `shouldSend(profileId, channel, prefCategory)` is parametric and matches nothing, which is
// exactly right, because the gate is the seam and not a reader of any one pair.
const NOT_READERS = new Set([
  'lib/database.types.ts',
  'lib/notification-preferences.ts',
  'lib/notifications/wired.ts',
])

const CHANNELS: readonly NotificationChannel[] = ['email', 'inapp', 'push']
const CATEGORY_SET = new Set<string>(NOTIFICATION_CATEGORIES)

/** Every `.ts`/`.tsx` under `abs`, depth-first. `withFileTypes` so there is no stat-then-open race. */
function tsFilesUnder(abs: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

/** Drop `/* … *\/` and `// …` so a comment that MENTIONS a pair is not counted as reading it. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Split a call's argument text at depth-0 commas, skipping quoted strings. */
function topLevelArgs(args: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < args.length; i++) {
    const c = args[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      out.push(args.slice(start, i))
      start = i + 1
    }
  }
  out.push(args.slice(start))
  return out
}

type Found = Map<string, string[]>

/** Record every (channel, category) pair `src` reads, tagged with `where` for the failure message. */
export function detectReaders(src: string, where: string, into: Found = new Map()): Found {
  const code = stripComments(src)
  const add = (channel: string, category: string, why: string) => {
    if (!CATEGORY_SET.has(category)) return
    const key = `${channel}_${category}`
    into.set(key, [...(into.get(key) ?? []), `${where} (${why})`])
  }

  // 1. Literal gate calls.
  for (const m of code.matchAll(/\b(?:shouldSend|resolveSendGate)\(\s*[^,()]+?,\s*'(email|inapp|push)'\s*,\s*'([a-z_]+)'/g)) {
    add(m[1], m[2], 'gate call')
  }

  // 2. Push sends: the category is the THIRD argument (lib/push.ts sendPushToProfile).
  const marker = 'sendPushToProfile('
  let at = 0
  while ((at = code.indexOf(marker, at)) !== -1) {
    const open = at + marker.length - 1
    let depth = 0
    let close = open
    for (; close < code.length; close++) {
      if (code[close] === '(') depth++
      else if (code[close] === ')' && --depth === 0) break
    }
    const args = topLevelArgs(code.slice(open + 1, close))
    const third = args[2] ?? ''
    const literal = third.match(/^\s*'([a-z_]+)'\s*$/)?.[1] ?? third.match(/'([a-z_]+)'/)?.[1]
    if (literal) add('push', literal, 'sendPushToProfile')
    at = close
  }

  // 3. Direct column reads (`prefs.inapp_practice`). The leading dot excludes the quoted consent
  //    scope strings ('email_lifecycle', 'email_marketing'), which are not preference reads.
  for (const m of code.matchAll(/\.(email|inapp|push)_([a-z]+)\b/g)) add(m[1], m[2], 'column read')

  return into
}

/** The registry's rows, which the router gates per declared channel. */
function registryReaders(into: Found): Found {
  const src = stripComments(read('lib/notifications/registry.ts'))
  for (const m of src.matchAll(/category:\s*'([a-z_]+)'[\s\S]*?channels:\s*\[([^\]]*)\]/g)) {
    for (const ch of m[2].matchAll(/'(email|inapp|push)'/g)) {
      const key = `${ch[1]}_${m[1]}`
      if (!CATEGORY_SET.has(m[1])) continue
      into.set(key, [...(into.get(key) ?? []), 'lib/notifications/registry.ts (registry row)'])
    }
  }
  return into
}

function readersInTree(): { found: Found; files: number } {
  const found: Found = new Map()
  let files = 0
  for (const root of ROOTS) {
    for (const full of tsFilesUnder(path.join(ROOT, root))) {
      const rel = path.relative(ROOT, full).split(path.sep).join('/')
      if (NOT_READERS.has(rel)) continue
      files++
      detectReaders(readFileSync(full, 'utf8'), rel, found)
    }
  }
  registryReaders(found)
  return { found, files }
}

describe('the detector (positive controls — each must fire, or the walk below proves nothing)', () => {
  it('sees a literal gate call, on either entry point', () => {
    expect([...detectReaders("await shouldSend(id, 'email', 'mentions')", 'x').keys()]).toEqual(['email_mentions'])
    expect([...detectReaders("resolveSendGate(p.id, 'push', 'comments', { email })", 'x').keys()]).toEqual(['push_comments'])
  })

  it('reads the category from the THIRD argument of a push send, not from a URL or title', () => {
    const src = "sendPushToProfile(pid, { title: 'events', url: '/events' }, 'comments', { subject })"
    expect([...detectReaders(src, 'x').keys()]).toEqual(['push_comments'])
  })

  it('sees a direct column read but not a consent-scope string', () => {
    expect([...detectReaders('if (prefs.inapp_comments) go()', 'x').keys()]).toEqual(['inapp_comments'])
    expect([...detectReaders("hasConsent(id, 'email_lifecycle')", 'x').keys()]).toEqual([])
  })

  it('does not count a comment that merely mentions a pair', () => {
    expect([...detectReaders("// shouldSend(id, 'email', 'comments') was here\n/* prefs.push_mentions */", 'x').keys()]).toEqual([])
  })

  it('finds the known readers in the live tree', () => {
    const { found, files } = readersInTree()
    // Corpus floor: an empty walk would pass every "no reader" assertion below by looking at nothing.
    expect(files).toBeGreaterThanOrEqual(1500)
    expect(found.get('inapp_practice')?.some((w) => w.startsWith('lib/practices/lifecycle.ts'))).toBe(true)
    expect(found.get('push_practice')?.some((w) => w.startsWith('lib/practices/lifecycle.ts'))).toBe(true)
    expect(found.get('email_dispatches')?.some((w) => w.startsWith('lib/events/dispatch.ts'))).toBe(true)
    expect(found.get('push_dispatches')?.some((w) => w.includes('registry row'))).toBe(true)
  })
})

describe('lib/notifications/wired.ts agrees with the tree, both ways', () => {
  it('every wired pair has a reader and every reader is a wired pair', () => {
    const { found } = readersInTree()
    const mismatches: string[] = []
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const channel of CHANNELS) {
        const key = `${channel}_${category}`
        const readers = found.get(key) ?? []
        const wired = isPreferenceWired(channel, category)
        if (wired && readers.length === 0) {
          mismatches.push(`${key}: marked wired but nothing reads it — the switch lies. Unwire it in lib/notifications/wired.ts or ship the reader.`)
        }
        if (!wired && readers.length > 0) {
          mismatches.push(`${key}: marked unwired but read at ${readers.join(', ')} — flip it in lib/notifications/wired.ts so the switch comes back.`)
        }
      }
    }
    expect(mismatches, `\n${mismatches.join('\n')}\n`).toEqual([])
  })

  it('pins the hidden set (meta-scan B9 D1/D6, the SCAN-528 shape): ten of eighteen', () => {
    // The five in-app switches outside Practice, both Mentions/Replies rows on every channel, and
    // Practice email. If this changes, an emitter shipped (good) or a reader was removed (say so).
    expect(WIRED_PREFERENCE_CHANNELS).toEqual({
      dispatches: ['email', 'push'],
      events:     ['email', 'push'],
      mentions:   [],
      lifecycle:  ['email', 'push'],
      comments:   [],
      practice:   ['inapp', 'push'],
    })
    const hidden: string[] = []
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const channel of CHANNELS) if (!isPreferenceWired(channel, category)) hidden.push(`${channel}_${category}`)
    }
    expect(hidden).toHaveLength(10)
    expect(wiredCategories(NOTIFICATION_CATEGORIES)).toEqual(['dispatches', 'events', 'lifecycle', 'practice'])
  })
})

describe('both preference surfaces render a switch ONLY for a wired pair (source shape)', () => {
  const FORM = read('app/(main)/settings/notifications/form.tsx')
  const MANAGE = read('app/manage-emails/page.tsx')

  it('/settings#notifications: an unwired cell is the dash placeholder, decided BEFORE the switch renders', () => {
    const guard = FORM.indexOf('if (!isPreferenceWired(channel, key))')
    const sw = FORM.indexOf('role="switch"')
    expect(guard).toBeGreaterThan(-1)
    expect(sw).toBeGreaterThan(guard)
    // The placeholder is the same visible absence the SMS column uses, titled so a hover says why.
    const cell = FORM.slice(guard, sw)
    expect(cell).toContain('title={NOT_WIRED_TITLE}')
    expect(cell).toContain('<Minus')
    expect(FORM).toMatch(/NOT_WIRED_TITLE = '[^']+'/)
  })

  it('/settings#notifications: a topic with no wired cell earns no row', () => {
    expect(FORM).toContain('const VISIBLE_CATEGORIES = wiredCategories(CATEGORIES.map((c) => c.key))')
    expect(FORM).toContain('CATEGORIES.filter(({ key }) => VISIBLE_CATEGORIES.includes(key)).map(')
    // The rows stay DECLARED so re-enabling is a map flip, not a copy hunt.
    expect(FORM).toContain("key:         'mentions'")
    expect(FORM).toContain("key:         'comments'")
  })

  it('/manage-emails: only email-wired categories reach the form', () => {
    expect(MANAGE).toContain("DISPLAY_ORDER.filter((category) => isPreferenceWired('email', category))")
    expect(MANAGE).toContain('VISIBLE_CATEGORIES.map((category) => ({')
    expect(MANAGE).not.toContain('DISPLAY_ORDER.map(')
  })

  it('the form imports the map from the client-safe module, never the admin-backed preferences module', () => {
    // lib/notification-preferences.ts imports the service-role client; a VALUE import from it in a
    // 'use client' file would drag that into the browser graph. Types only, values from ./wired.
    expect(FORM).toMatch(/import type \{[^}]*\} from '@\/lib\/notification-preferences'/)
    expect(FORM).not.toMatch(/import \{[^}]*\} from '@\/lib\/notification-preferences'/)
    expect(FORM).toContain("from '@/lib/notifications/wired'")
  })
})
