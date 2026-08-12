import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── ONE DRAFTS SURFACE ────────────────────────────────────────────────────────────────
//
// Owner ruling 2026-08-12: "Fold /events/drafts into /drafts as a third row kind, and add the
// NAMING.md entry defining Drafts as the one surface. One place for everything unfinished, which
// is the argument /drafts already makes for itself."
//
// The defect was not a bug in either page; both worked. It was that the WORD named two places. A
// member with a captured poster and a half-typed Journey had two unrelated surfaces called Drafts,
// reached from different chrome, neither linking to the other — and nothing could fail, because
// "how many surfaces claim this name" is not a property any type or render test can see.
//
// These assertions are that property. They are deliberately about REACHABILITY and NAMING rather
// than markup: a second Drafts list would pass every other guard in the repo.

const ROOTS = ['app', 'components', 'lib']
const SKIP_DIRS = new Set(['node_modules', '.next', '.claude'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    // Tests are excluded on purpose: they QUOTE the old path and the retired label in order to
    // assert against them, and a guard that fails on its own evidence is a guard nobody keeps.
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p.replaceAll('\\', '/'))
  }
  return out
}

const SOURCES = ROOTS.flatMap((r) => walk(r))

/**
 * Comments blanked, offsets preserved (the CORPUS_BASIS trick from scripts/check-adoption.mjs).
 *
 * Prose ABOUT a name is not a USE of it, and this repo writes long explanatory headers: every
 * file below explains WHY the old surface folded, which named it. Matching raw source made the
 * comment that documents the fix indistinguishable from the defect.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
}
const STUB = 'app/(main)/events/drafts/page.tsx'

/** `/events/drafts` as a DESTINATION — the old list — never `/events/drafts/<id>`, which is the
 *  per-event editor and keeps its own route. */
const LIST_HREF = /['"`]\/events\/drafts['"`]/

describe('the Drafts surface is one place', () => {
  it('nothing in the tree still links to the old /events/drafts list', () => {
    const offenders = SOURCES.filter(
      (f) => f !== STUB && LIST_HREF.test(code(f)),
    )
    expect(
      offenders,
      `these still point at the folded list instead of /drafts: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('/events/drafts forwards to /drafts instead of 404ing a bookmarked path', () => {
    // A DELIBERATE redirect, not a deletion: this was a live member surface with real inbound
    // links and the kind of path a member bookmarks after capturing a poster. Deleting the file
    // would also 404 a segment whose own child route still exists (/events/drafts/<id>).
    const src = readFileSync(STUB, 'utf8')
    expect(src).toMatch(/permanentRedirect\(\s*['"]\/drafts['"]\s*\)/)
    // ...and it is a stub, not a second list wearing a forward.
    expect(src).not.toMatch(/EntityCard|RowCard|FocusTemplate|IndexTemplate/)
  })

  it('the per-event EDITOR keeps its own route and points back at the one surface', () => {
    const editor = readFileSync('app/(main)/events/drafts/[id]/page.tsx', 'utf8')
    expect(editor).toContain("back={{ href: '/drafts', label: 'Drafts' }}")
    expect(editor).not.toContain("label: 'My drafts'")
  })

  it('carries all THREE row kinds on the one list', () => {
    const page = readFileSync('app/(main)/drafts/page.tsx', 'utf8')
    for (const row of ['DraftRow', 'UnfinishedDraftRow', 'EventDraftRow']) {
      expect(page, `${row} is not rendered on /drafts`).toContain(`<${row}`)
    }
  })

  it('never says "My drafts" at a member, anywhere', () => {
    // docs/NAMING.md: the page's H1, its metadata title, the nav row, the palette entry and every
    // link to it read "Drafts". A menu row that renames its destination makes a member wonder if
    // they landed somewhere else.
    const offenders = SOURCES.filter((f) => /['">]My drafts\b/.test(code(f)))
    expect(offenders, `"My drafts" survives in: ${offenders.join(', ')}`).toEqual([])
  })

  it('is defined in the naming canon, which is what made this an owner call', () => {
    const naming = readFileSync('docs/NAMING.md', 'utf8')
    expect(naming).toMatch(/^## Drafts: one surface, every unfinished thing/m)
    expect(naming).toContain('`/drafts`')
  })
})

// ── THE THIRD ROW KIND READS ONLY UNFINISHED THINGS ───────────────────────────────────

const captured: { fn: string; args: unknown[] }[] = []

vi.mock('@/lib/supabase/admin', () => {
  const chain: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'is', 'order']) {
    chain[fn] = (...args: unknown[]) => {
      captured.push({ fn, args })
      return chain
    }
  }
  chain.limit = (...args: unknown[]) => {
    captured.push({ fn: 'limit', args })
    return Promise.resolve({ data: [], error: null })
  }
  return { createAdminClient: () => ({ from: () => chain }) }
})

const { listMyUnfinishedEventDrafts } = await import('@/lib/events/event-drafts')

describe('listMyUnfinishedEventDrafts', () => {
  it('asks the DATABASE for drafts only, and only the caller\'s own', async () => {
    // A published capture IS made, so it is not a draft: it lists on the member's own /events
    // (which reads host_id OR posted_by_profile_id) and on /admin/events. Filtering in SQL keeps
    // the surface's promise — "nothing here is made yet" — and the query in agreement, instead of
    // pulling a hundred finished rows over the wire to throw nearly all of them away.
    captured.length = 0
    await listMyUnfinishedEventDrafts('me')
    const eqs = captured.filter((c) => c.fn === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['posted_by_profile_id', 'me'])
    expect(eqs).toContainEqual(['status', 'draft'])
    expect(captured.filter((c) => c.fn === 'is').map((c) => c.args)).toContainEqual([
      'removed_at',
      null,
    ])
  })
})
