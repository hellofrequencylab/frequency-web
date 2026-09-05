import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { config } from '@/lib/page-editor/config'
import { spacesComponents } from '@/components/page-editor/blocks/spaces'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { PROFILE_BLOCKS } from '@/lib/spaces/profile-blocks'

// ── Drift guard: SpaceUpdates stays retired, its TABLE stays kept (LIVE-062 batch 6) ─────────────
// OWNER RULING (2026-08-20): retire the SpaceUpdates UI + write actions, KEEP the space_updates
// table. The block's only composer died with the C3.4 community wall; measured against production,
// 0 space_updates rows and 0 published pages carried the block, so the block, the profile widget,
// the write actions (createSpaceUpdate / updateSpaceUpdate / deleteSpaceUpdate) and the reader
// (getSpaceUpdates) all went together. Source-level in the house archetype (comments stripped
// before absence assertions, app/(main)/walkthrough-actions.test.ts) because re-adding any half is
// SILENT: an unmounted block or an uncalled action fails nothing at runtime — it just starts the
// dead read/write path over again.

/** Strip comments so the retirement notes that legitimately NAME the retired things never trip the
 *  absence assertions (the precedent walkthrough-actions.test.ts records). */
function stripped(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

describe('the SpaceUpdates block is out of every registry', () => {
  it('is not a Puck component and not in the Space content category', () => {
    expect(config.components.SpaceUpdates).toBeUndefined()
    expect(spacesComponents.SpaceUpdates).toBeUndefined()
    expect(config.categories?.spaceContent?.components).not.toContain('SpaceUpdates')
  })

  it('the unified entity-block + S1 profile registries no longer carry an updates block', () => {
    expect(entityBlockById('updates')).toBeNull()
    expect(PROFILE_BLOCKS.map((b) => b.id)).not.toContain('updates')
  })

  it('the surviving Space content blocks stay registered (positive control)', () => {
    expect(config.components.SpaceReviews).toBeTruthy()
    expect(config.components.SpaceFAQ).toBeTruthy()
    expect(entityBlockById('reviews')).not.toBeNull()
  })
})

describe('the write actions and the reader are gone from the content modules', () => {
  const actions = stripped('lib/spaces/content-actions.ts')
  const data = stripped('lib/spaces/content-data.ts')

  it('content-actions exports no Update writer', () => {
    expect(actions).not.toContain('createSpaceUpdate')
    expect(actions).not.toContain('updateSpaceUpdate')
    expect(actions).not.toContain('deleteSpaceUpdate')
    expect(actions).not.toContain('ensureUpdateAnchor')
  })

  it('content-actions keeps the FAQ + review actions (positive control, guards a vacuous pass)', () => {
    expect(actions).toContain('export async function createSpaceFaq')
    expect(actions).toContain('export async function deleteSpaceFaq')
    expect(actions).toContain('export async function submitSpaceReview')
  })

  it('content-data no longer reads space_updates', () => {
    expect(data).not.toContain('getSpaceUpdates')
    expect(data).not.toContain('space_updates')
    // The surviving readers stay (positive control).
    expect(data).toContain('export async function getSpaceReviews')
    expect(data).toContain('export async function getSpaceFaqs')
  })
})

describe('the C3.5 table retention stands recorded (the ruling KEEPS the table)', () => {
  it('the migration records that the space_updates table itself is untouched', () => {
    const migration = readFileSync('supabase/migrations/20270317000000_narrow_space_update_rls_arms.sql', 'utf8')
    expect(migration).toMatch(/space_updates TABLE and its own policies are untouched/)
  })

  it('the reader site carries the retention note where getSpaceUpdates used to live', () => {
    const raw = readFileSync('lib/spaces/content-data.ts', 'utf8')
    // Doc-pin (scan2 L8-05): this pins a COMMENT in the source on purpose, as documentation, not behaviour.
    expect(raw).toMatch(/space_updates TABLE stays, per C3\.5/)
  })
})
