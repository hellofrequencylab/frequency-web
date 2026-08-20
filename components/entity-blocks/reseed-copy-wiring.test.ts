import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: the per-block copy re-seed reaches the rail (task #17 · LIVE-062 batch 5) ──
// `reseedSpaceBlockCopy` (settings/profile/actions.ts) and its seam `reseedBlockCopy`
// (lib/importer/compose.ts) shipped write-free by design: the action RETURNS the rewritten fields
// and the editor merges them through its normal debounced save, so there is exactly one write path.
// That design only holds if the editor actually mounts the button and actually merges through
// onContent. Source-shape, per the house archetype (components/spaces/staff-preview-banner.test.ts):
// unwiring this is silent — the rail still edits, the button just disappears.

const panel = readFileSync('components/entity-blocks/block-edit-panel.tsx', 'utf8')
const builder = readFileSync('components/entity-blocks/profile-page-builder.tsx', 'utf8')
const actions = readFileSync('app/(main)/spaces/[slug]/settings/profile/actions.ts', 'utf8')

describe('the block edit panel carries the re-seed button', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(panel.length).toBeGreaterThan(5000)
  })

  it('calls reseedSpaceBlockCopy from the shared actions file', () => {
    expect(panel).toContain("from '@/app/(main)/spaces/[slug]/settings/profile/actions'")
    expect(panel).toContain('await reseedSpaceBlockCopy(slug, blockId, content)')
  })

  it('shows only where a Space slug is in play and the block carries text fields', () => {
    expect(panel).toContain("reseedSlug && allFields.some((f) => f.type === 'text' || f.type === 'textarea')")
  })

  it('merges the result through onContent — the ONE debounced save path, never a second write', () => {
    expect(panel).toContain('onContent({ ...content, ...res.content })')
    // The button must not grow its own persistence: the action writes nothing and neither does this.
    const buttonBody = panel.slice(panel.indexOf('function ReseedCopyButton'), panel.indexOf('/** One field editor'))
    expect(buttonBody).not.toContain('saveSpaceProfileLayout')
    expect(buttonBody).not.toContain('fetch(')
  })

  it('disables while pending and surfaces the refusal plainly', () => {
    expect(panel).toContain("{pending ? 'Rewriting' : 'Re-seed copy'}")
    const buttonBody = panel.slice(panel.indexOf('function ReseedCopyButton'), panel.indexOf('/** One field editor'))
    expect(buttonBody).toContain('disabled={pending}')
    expect(buttonBody).toContain('setError(res.error)')
  })
})

describe('the builder hands the panel its Space slug', () => {
  it('passes reseedSlug on a Space page only (a member page has no seeded profile)', () => {
    expect(builder).toContain("reseedSlug={kind === 'space' ? pageId : undefined}")
  })
})

describe('the action contract the button relies on holds', () => {
  it('reseedSpaceBlockCopy sanitizes the wire bag and RETURNS fields instead of writing', () => {
    const body = actions.slice(actions.indexOf('export async function reseedSpaceBlockCopy'))
    expect(body).toContain('sanitizeBlockContent(blockId, current)')
    expect(body).toContain('return { content: copy }')
    // No persistence in the action: one write path means the merge lands via the editor's save.
    expect(body).not.toContain('.update(')
  })
})
