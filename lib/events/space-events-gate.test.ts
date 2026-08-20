import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── The publication gate on listEventsForSpace, and the ONE caller allowed past it ───────────────
//
// Source-level (the house archetype, app/(main)/walkthrough-actions.test.ts) because every failure
// here is SILENT at runtime: nothing throws when a draft renders on a public page, it just renders.
//
// WHAT WENT WRONG, 2026-08-20. listEventsForSpace reads through the SERVICE-ROLE client, so RLS is
// bypassed and its own query is the only gate there is — and it had none: `space_id`, and
// optionally a start date. `SpaceEvent.status` has carried the comment "public readers filter on
// it" since the field was added, and not one public reader did. So an unpublished draft, or a
// `private` event, on a Space rendered on that Space's PUBLIC profile.
//
// The fix makes the SAFE read the default and the unsafe read the thing you ask for by name.

const store = readFileSync('lib/events/store.ts', 'utf8')
const consoleCalendar = readFileSync('app/(main)/spaces/[slug]/settings/calendar/page.tsx', 'utf8')

/** Comments stripped: a gate described in a comment is exactly what failed here. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('listEventsForSpace gates on publication by default', () => {
  const body = code(store)

  it('the three predicates are applied in the query, not left to callers', () => {
    expect(body).toContain("if (!opts.includeUnpublished)")
    expect(body).toContain(".eq('status', 'published')")
    expect(body).toContain(".in('visibility', ['public', 'unlisted'])")
    expect(body).toContain(".is('removed_at', null)")
  })

  it('the escape hatch is opt-IN, so a caller that asks for nothing gets the safe read', () => {
    // The negation is the whole contract: `!opts.includeUnpublished` means the gate runs unless
    // someone names the option. An inverted flag (`opts.publicOnly`) would put every future caller
    // one forgotten argument away from the bug this closed.
    expect(body).toContain('includeUnpublished?: boolean')
    expect(body).not.toContain('publicOnly')
  })
})

describe('exactly one caller opts out, and it is the operator console', () => {
  it('the Space settings calendar asks for unpublished rows explicitly', () => {
    expect(code(consoleCalendar)).toContain('includeUnpublished: true')
  })

  it('🔴 no PUBLIC reader asks for unpublished rows', async () => {
    // The public Space surfaces, by file. If a future edit adds `includeUnpublished` to any of
    // them, a draft goes back on a public page and this fails instead of a member finding it.
    const PUBLIC_READERS = [
      'components/widgets/entity/entity-offerings.tsx',
      'components/widgets/entity/entity-cta.tsx',
      'lib/spaces/content-data.ts',
      'lib/spaces/profile-stats.ts',
      'lib/spaces/profile-presence.ts',
      'components/spaces/dashboard/space-dashboard.tsx',
    ]
    for (const f of PUBLIC_READERS) {
      const src = code(readFileSync(f, 'utf8'))
      // Positive control first: the file really does still call the function this test is about,
      // so a rename cannot turn this into an assertion that passes by looking at nothing.
      expect(src, `${f} should still call listEventsForSpace`).toContain('listEventsForSpace(')
      expect(src, `${f} must not opt out of the publication gate`).not.toContain('includeUnpublished')
    }
  })
})
