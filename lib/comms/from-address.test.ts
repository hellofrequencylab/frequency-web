import { describe, it, expect, afterEach } from 'vitest'
import {
  addressOf,
  conversationAddress,
  conversationFrom,
  formatDisplayName,
  DEFAULT_CONVERSATION_ADDRESS,
} from './from-address'

// scan2 L3-01 / L3-02 (2026-09-05). The header every conversational email carries. The regression
// these lock down: with EMAIL_CONVERSATION_FROM unset and EMAIL_FROM in its documented `Name <addr>`
// form, six builders produced `Ada via Frequency <Frequency <noreply@...>>` (nested, invalid, rejected
// by the provider). With EMAIL_CONVERSATION_FROM BLANK they produced `Ada via Frequency <>`.

const KEYS = ['EMAIL_CONVERSATION_FROM', 'EMAIL_FROM'] as const
const saved = new Map<string, string | undefined>()

function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const k of KEYS) if (!saved.has(k)) saved.set(k, process.env[k])
  for (const k of KEYS) {
    const v = patch[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  saved.clear()
})

/** One angle-bracket pair, exactly one `@` inside it, nothing after it: the shape a provider accepts. */
function isSingleMailbox(from: string): boolean {
  const lt = from.indexOf('<')
  const gt = from.indexOf('>')
  if (lt < 0 || gt < lt) return false
  if (from.indexOf('<', lt + 1) !== -1 || from.indexOf('>', gt + 1) !== -1) return false
  const addr = from.slice(lt + 1, gt)
  return addr.split('@').length === 2 && addr.length > 3 && gt === from.length - 1
}

describe('addressOf', () => {
  it('takes the address out of both documented forms', () => {
    expect(addressOf('Frequency <noreply@send.frequencylocal.com>')).toBe('noreply@send.frequencylocal.com')
    expect(addressOf('people@people.frequencylocal.com')).toBe('people@people.frequencylocal.com')
    expect(addressOf('  "Ada, L" <ada@x.test>  ')).toBe('ada@x.test')
  })

  it('never returns an angle bracket, even from a broken value', () => {
    expect(addressOf('Frequency <noreply@x.test')).toBe('noreply@x.test')
    expect(addressOf('<<a@b.test>>')).not.toMatch(/[<>]/)
  })
})

describe('conversationAddress (L3-02: blank is unset)', () => {
  it('uses EMAIL_CONVERSATION_FROM when set, in either form', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: 'people@people.test', EMAIL_FROM: 'Frequency <noreply@x.test>' })
    expect(conversationAddress()).toBe('people@people.test')
    setEnv({ EMAIL_CONVERSATION_FROM: 'Frequency People <people@people.test>' })
    expect(conversationAddress()).toBe('people@people.test')
  })

  it('falls through a BLANK EMAIL_CONVERSATION_FROM to the address inside EMAIL_FROM', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: '', EMAIL_FROM: 'Frequency <noreply@send.frequencylocal.com>' })
    expect(conversationAddress()).toBe('noreply@send.frequencylocal.com')
    setEnv({ EMAIL_CONVERSATION_FROM: '   ', EMAIL_FROM: 'noreply@send.frequencylocal.com' })
    expect(conversationAddress()).toBe('noreply@send.frequencylocal.com')
  })

  it('falls through both blank to the default', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: '', EMAIL_FROM: '' })
    expect(conversationAddress()).toBe(DEFAULT_CONVERSATION_ADDRESS)
    setEnv({ EMAIL_CONVERSATION_FROM: undefined, EMAIL_FROM: undefined })
    expect(conversationAddress()).toBe(DEFAULT_CONVERSATION_ADDRESS)
  })
})

describe('formatDisplayName', () => {
  it('leaves a plain phrase bare and quotes one that needs it', () => {
    expect(formatDisplayName('Ada Lovelace')).toBe('Ada Lovelace')
    expect(formatDisplayName('Lovelace, Ada')).toBe('"Lovelace, Ada"')
    expect(formatDisplayName('Dr. Ada')).toBe('"Dr. Ada"')
    expect(formatDisplayName('José')).toBe('"José"')
  })

  it('escapes quotes and backslashes inside a quoted name and drops brackets + control chars', () => {
    expect(formatDisplayName('Ada "The" Lovelace')).toBe('"Ada \\"The\\" Lovelace"')
    expect(formatDisplayName('a\\b')).toBe('"a\\\\b"')
    expect(formatDisplayName('Ada <ada@x.test>\r\nBcc: x')).not.toMatch(/[<>\r\n]/)
    expect(formatDisplayName('   ')).toBe('')
  })
})

describe('conversationFrom (L3-01: one valid mailbox, never nested)', () => {
  it('EMAIL_FROM in display form, EMAIL_CONVERSATION_FROM unset: extracts the address', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: undefined, EMAIL_FROM: 'Frequency <noreply@send.frequencylocal.com>' })
    const from = conversationFrom('Ada')
    expect(from).toBe('Ada via Frequency <noreply@send.frequencylocal.com>')
    expect(isSingleMailbox(from)).toBe(true)
  })

  it('EMAIL_FROM bare, EMAIL_CONVERSATION_FROM unset', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: undefined, EMAIL_FROM: 'noreply@send.frequencylocal.com' })
    expect(conversationFrom('Ada')).toBe('Ada via Frequency <noreply@send.frequencylocal.com>')
  })

  it('EMAIL_CONVERSATION_FROM set wins over EMAIL_FROM', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: 'people@people.frequencylocal.com', EMAIL_FROM: 'Frequency <noreply@x.test>' })
    expect(conversationFrom('Ada')).toBe('Ada via Frequency <people@people.frequencylocal.com>')
  })

  it('a display name with a comma is quoted as one phrase', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: 'people@people.test', EMAIL_FROM: undefined })
    const from = conversationFrom('Lovelace, Ada')
    expect(from).toBe('"Lovelace, Ada via Frequency" <people@people.test>')
    expect(isSingleMailbox(from)).toBe(true)
  })

  it('a missing name is the platform, and never "Frequency via Frequency"', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: 'people@people.test', EMAIL_FROM: undefined })
    expect(conversationFrom(null)).toBe('Frequency <people@people.test>')
    expect(conversationFrom('  ')).toBe('Frequency <people@people.test>')
    expect(conversationFrom('Frequency')).toBe('Frequency <people@people.test>')
  })

  it('via: false is the brand form (a Space or campaign sender)', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: 'people@people.test', EMAIL_FROM: undefined })
    expect(conversationFrom('Riverside Studio', { via: false })).toBe('Riverside Studio <people@people.test>')
  })

  it('a name that tries to smuggle an address cannot nest brackets', () => {
    setEnv({ EMAIL_CONVERSATION_FROM: undefined, EMAIL_FROM: 'Frequency <noreply@x.test>' })
    const from = conversationFrom('Mallory <mallory@evil.test>')
    expect(isSingleMailbox(from)).toBe(true)
    expect(from.endsWith('<noreply@x.test>')).toBe(true)
  })
})
