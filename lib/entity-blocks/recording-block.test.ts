import { describe, it, expect } from 'vitest'
import { entityBlockById, blockSupportsKind, CORE_PROFILE_BLOCK_IDS } from './registry'
import { fieldsForBlock, sanitizeBlockContent } from './block-content'

// Airwaves P1 — the `recording` entity-block contract (ADR-608 §6a). Locks the registry entry, the field
// schema, and the sanitize of the new `recordingPicker` field so the block stays additive + fail-safe.

describe('recording entity-block', () => {
  it('is registered as a web content block on member + space (not email)', () => {
    const block = entityBlockById('recording')
    expect(block).not.toBeNull()
    expect(block?.category).toBe('content')
    expect(blockSupportsKind(block!, 'space')).toBe(true)
    expect(blockSupportsKind(block!, 'member')).toBe(true)
    expect(blockSupportsKind(block!, 'email')).toBe(false)
  })

  it('is offered in the curated profile palette set', () => {
    expect(CORE_PROFILE_BLOCK_IDS.has('recording')).toBe(true)
  })

  it('declares the recordingId picker plus display / autoplay / transcript controls', () => {
    const fields = fieldsForBlock('recording')
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]))
    expect(byKey.recordingId?.type).toBe('recordingPicker')
    expect(byKey.display?.type).toBe('segmented')
    expect(byKey.autoplay?.type).toBe('toggle')
    expect(byKey.showTranscript?.type).toBe('toggle')
  })

  it('sanitizes a full authored bag, keeping the id and only non-default toggles', () => {
    const clean = sanitizeBlockContent('recording', {
      recordingId: 'rec-123',
      display: 'compact',
      autoplay: true, // differs from the default (false) → kept
      showTranscript: false, // differs from the default (true) → kept
      bogus: '<script>',
    })
    expect(clean).toEqual({
      recordingId: 'rec-123',
      display: 'compact',
      autoplay: true,
      showTranscript: false,
    })
  })

  it('drops a blank recording id and default-valued controls (sparse blob)', () => {
    const clean = sanitizeBlockContent('recording', {
      recordingId: '   ',
      display: 'full', // the default → dropped
      autoplay: false, // the default → dropped
      showTranscript: true, // the default → dropped
    })
    expect(clean).toBeUndefined()
  })
})
