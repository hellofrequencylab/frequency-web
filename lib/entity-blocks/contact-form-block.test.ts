import { describe, expect, it } from 'vitest'
import { ENTITY_BLOCKS, entityBlockById, CORE_PROFILE_BLOCK_IDS, blocksForKind } from './registry'
import { fieldsForBlock, sanitizeBlockContent } from './block-content'

// THE CONTACT FORM BLOCK's registry + schema contract (lead capture, door 6). Modelled on
// recording-block.test.ts, which is the house pattern for a new block: it is registered, it is in
// the palette, its field schema is what the editor will draw, and its bag survives a sanitize
// round-trip. Two of these catch the silent-failure modes the block system has no gate for.

describe('contactForm block — registry', () => {
  it('is registered as authored content, space-only', () => {
    const block = entityBlockById('contactForm')
    expect(block).not.toBeNull()
    expect(block?.category).toBe('content')
    // Space-only by necessity, not by preference: an email has nowhere to post to, and a member
    // Spotlight has no CRM for a submission to land in.
    expect(block?.kinds).toEqual(['space'])
    // Only a space DATA block may be function-gated; an authored block never is.
    expect(block?.requiresFunction).toBeUndefined()
  })

  it('is in the palette, so it can actually be added to a page', () => {
    // A block absent from CORE_PROFILE_BLOCK_IDS still RENDERS where already placed but can never be
    // added — the failure mode is an operator who cannot find a block that demonstrably exists.
    expect(CORE_PROFILE_BLOCK_IDS.has('contactForm')).toBe(true)
    expect(blocksForKind('space').map((b) => b.id)).toContain('contactForm')
  })

  it('is offered on the space kind and nowhere else', () => {
    expect(blocksForKind('member').map((b) => b.id)).not.toContain('contactForm')
    expect(blocksForKind('email').map((b) => b.id)).not.toContain('contactForm')
  })

  it('keeps the registry order ascending around it', () => {
    const orders = ENTITY_BLOCKS.map((b) => b.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })
})

describe('contactForm block — the operator schema', () => {
  it('declares exactly the fields the editor draws', () => {
    expect(fieldsForBlock('contactForm').map((f) => f.key)).toEqual([
      'eyebrow',
      'title',
      'body',
      'showPhone',
      'showMessage',
      'messageLabel',
      'optInLabel',
      'submitLabel',
      'successMessage',
    ])
  })

  // 🔴 THE CONSENT INVARIANT, PINNED. The contact-form door is not consent-native: the sender's own
  // tick is the only thing that makes them mailable (lib/crm/lead-capture.ts). An operator-settable
  // "pre-tick the box" field would route straight around that, so the schema must never grow one.
  // This test is the guard on that, not a description of it.
  it('offers NO way for an operator to pre-tick the opt-in', () => {
    const keys = fieldsForBlock('contactForm').map((f) => f.key)
    for (const forbidden of ['optIn', 'optInDefault', 'optInChecked', 'defaultOptIn', 'subscribe']) {
      expect(keys).not.toContain(forbidden)
    }
    // The opt-in field that DOES exist only changes the words beside the box.
    const optInField = fieldsForBlock('contactForm').find((f) => f.key === 'optInLabel')
    expect(optInField?.type).toBe('text')
  })

  it('asks for a message by default and a phone number only on request', () => {
    const byKey = Object.fromEntries(fieldsForBlock('contactForm').map((f) => [f.key, f]))
    expect(byKey.showMessage?.default).toBe(true)
    expect(byKey.showPhone?.default).toBe(false)
  })
})

describe('contactForm block — sanitize round-trip', () => {
  it('keeps the authored copy and the toggles', () => {
    const out = sanitizeBlockContent('contactForm', {
      eyebrow: 'Say hello',
      title: 'Work with us',
      body: 'Tell us what you are planning.',
      showPhone: true,
      messageLabel: 'What do you have in mind?',
      optInLabel: 'Send me the newsletter',
      submitLabel: 'Send it',
      successMessage: 'Got it. We will write back.',
    })
    expect(out).toMatchObject({
      eyebrow: 'Say hello',
      title: 'Work with us',
      showPhone: true,
      messageLabel: 'What do you have in mind?',
      optInLabel: 'Send me the newsletter',
      submitLabel: 'Send it',
    })
  })

  it('drops a value equal to its declared default, so the stored bag stays sparse', () => {
    // showPhone defaults false and showMessage defaults true, so neither should be written.
    const out = sanitizeBlockContent('contactForm', { showPhone: false, showMessage: true })
    expect(out?.showPhone).toBeUndefined()
    expect(out?.showMessage).toBeUndefined()
  })

  it('drops unknown keys rather than storing them', () => {
    // The sanitizer iterates the SCHEMA, not the input, so a forged key cannot reach storage —
    // including one that would look like a consent override.
    const out = sanitizeBlockContent('contactForm', { title: 'Hi', optInDefault: true, spaceId: 'x' })
    expect(out?.title).toBe('Hi')
    expect(out?.optInDefault).toBeUndefined()
    expect(out?.spaceId).toBeUndefined()
  })

  it('returns undefined for an empty bag', () => {
    expect(sanitizeBlockContent('contactForm', {})).toBeUndefined()
  })
})
