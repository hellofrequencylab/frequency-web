import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The predicate in ./directory-visibility.ts was applied to /network and /search first; these are
// the OTHER member-to-member listings that had the same `is_active`-only shape. Pinned by source so
// a fifth listing added with the old shape is a red test rather than a fifth privacy hole.
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const IMPORT = "from '@/lib/connections/directory-visibility'"

describe('every member listing selects the privacy columns and filters through the predicate', () => {
  it('⌘K people search (app/api/search/route.ts) gates before the six-row trim', () => {
    const src = read('app/api/search/route.ts')
    expect(src).toContain(IMPORT)
    expect(src).toContain('${DIRECTORY_VISIBILITY_COLUMNS}`)')
    expect(src).toContain('.filter(isListableInDirectory).slice(0, 6)')
    expect(src).not.toMatch(/select\('id, display_name, handle, avatar_url, community_role, is_demo'\)/)
  })

  it('the four sidebar rails (components/sidebar/rail-panels.tsx) all gate', () => {
    const src = read('components/sidebar/rail-panels.tsx')
    expect(src).toContain(IMPORT)
    // Four member listings, four selects carrying the columns, four filters — the count IS the pin.
    expect((src.match(/\$\{DIRECTORY_VISIBILITY_COLUMNS\}`\)/g) ?? []).length).toBe(4)
    expect((src.match(/\.filter\(isListableInDirectory\)/g) ?? []).length).toBe(4)
    // Exactly ONE profiles select in this file stays on a bare column list: the season leaderboard
    // (`current_season_zaps, current_season_rank`), which is a ranking with its own opt-out in
    // profile meta, not a directory (W1's exemption). A second bare select is a new listing that
    // skipped the predicate.
    const bare = src.match(/\.from\('profiles'\)\s*\.select\('id, display_name, handle, avatar_url[^`]*'\)/g) ?? []
    expect(bare).toHaveLength(1)
    expect(bare[0]).toContain('current_season_rank')
  })
})
