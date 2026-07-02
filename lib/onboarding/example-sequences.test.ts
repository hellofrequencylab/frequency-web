import { describe, it, expect } from 'vitest'
import { previewSequenceFor, EXAMPLE_SEQUENCES, PRACTITIONER_SEQUENCE } from './example-sequences'
import { DEFAULT_ONBOARDING_SEQUENCE } from './default-sequence'
import { parseSequenceDef } from './sequence-schema'

describe('previewSequenceFor', () => {
  it('returns the practitioner flow for the practitioner persona', () => {
    expect(previewSequenceFor('practitioner').key).toBe(PRACTITIONER_SEQUENCE.key)
  })

  it('falls back to the default for an untargeted persona', () => {
    expect(previewSequenceFor('visitor').key).toBe(DEFAULT_ONBOARDING_SEQUENCE.key)
  })

  it('falls back to the default for null / unknown persona', () => {
    expect(previewSequenceFor(null).key).toBe(DEFAULT_ONBOARDING_SEQUENCE.key)
    expect(previewSequenceFor('nope').key).toBe(DEFAULT_ONBOARDING_SEQUENCE.key)
  })
})

describe('example sequences are valid SequenceDefs', () => {
  it('every example parses through the runtime schema', () => {
    for (const seq of EXAMPLE_SEQUENCES) {
      expect(parseSequenceDef(seq)).not.toBeNull()
    }
  })

  it('the practitioner flow targets exactly the practitioner persona', () => {
    expect(PRACTITIONER_SEQUENCE.target?.personas).toEqual(['practitioner'])
  })

  it('carries no em dashes in any copy (CONTENT-VOICE §10)', () => {
    const copy = JSON.stringify(EXAMPLE_SEQUENCES)
    expect(copy).not.toContain('—')
  })
})
