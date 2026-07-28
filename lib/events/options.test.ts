import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { coerceVisibilityForScope, VISIBILITY_OPTIONS } from './options'

// ADR-883's visibility step-down, now applied at EVERY write seam. The bug this pins down:
// createEvent coerced circle_only → public on a non-circle scope while updateEvent wrote any
// submitted visibility uncoerced — so an edit that picked "My circle" on a public-scoped event
// made it readable by its host alone (the RLS circle_only branch only matches circle scopes)
// while staying fully link-readable. Invisible AND ungated at once.
describe('coerceVisibilityForScope (ADR-883 step-down)', () => {
  it('steps circle_only DOWN to unlisted on a public (region) scope — never up to public', () => {
    expect(coerceVisibilityForScope('circle_only', 'public')).toBe('unlisted')
  })

  it('steps circle_only down on a null/unknown scope_type too (fail narrow)', () => {
    expect(coerceVisibilityForScope('circle_only', null)).toBe('unlisted')
    expect(coerceVisibilityForScope('circle_only', undefined)).toBe('unlisted')
    expect(coerceVisibilityForScope('circle_only', 'standalone')).toBe('unlisted')
  })

  it('keeps circle_only on a circle scope — the one pair the RLS branch can honor', () => {
    expect(coerceVisibilityForScope('circle_only', 'circle')).toBe('circle_only')
  })

  it.each(['public', 'unlisted', 'private'])(
    'never touches %s on any scope',
    (visibility) => {
      expect(coerceVisibilityForScope(visibility, 'circle')).toBe(visibility)
      expect(coerceVisibilityForScope(visibility, 'public')).toBe(visibility)
      expect(coerceVisibilityForScope(visibility, null)).toBe(visibility)
    },
  )

  it('its vocabulary is drawn from the canonical option list', () => {
    // If circle_only or unlisted is ever renamed in VISIBILITY_OPTIONS, this helper must move
    // with it rather than silently minting a value the CHECK constraint rejects.
    const values = new Set(VISIBILITY_OPTIONS.map((o) => o.value))
    expect(values.has('circle_only')).toBe(true)
    expect(values.has('unlisted')).toBe(true)
  })
})

// Source-shape guards: the three visibility writers must all route through the ONE helper.
// The failure these prevent is an absent call — a mocked client would answer whatever a
// behavioural test asked, so assert the seam literally (the upcoming-widget.test.ts precedent).
describe('every event visibility write routes through coerceVisibilityForScope', () => {
  const actions = readFileSync(join(__dirname, '../../app/(main)/events/actions.ts'), 'utf8')
  const adminActions = readFileSync(
    join(__dirname, '../../app/(main)/events/admin-actions.ts'),
    'utf8',
  )

  it('createEvent coerces against the scope it is writing', () => {
    expect(actions).toContain('coerceVisibilityForScope(visibility, scopeType)')
  })

  it('updateEvent fetches the row scope_type and coerces against it', () => {
    expect(actions).toContain("select('slug, parent_event_id, details, scope_type')")
    expect(actions).toContain('coerceVisibilityForScope(visibilityRequested, evRow?.scope_type)')
  })

  it('the /manage settings write coerces against the row scope_type', () => {
    expect(adminActions).toContain("select('details, theme, scope_type')")
    expect(adminActions).toContain('coerceVisibilityForScope(')
  })
})
