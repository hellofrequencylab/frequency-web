import { describe, it, expect } from 'vitest'
import { deriveDmTitle, dmTitle } from './dm-title'

// The DM display-name rule now has three consumers (the dock's server loader, the dock's
// optimistic rename, and the page's own copy), and it had ALREADY drifted once — the loader
// dropped the `+N` overflow the page appends. These pin the rule itself.

describe('deriveDmTitle', () => {
  const p = (display_name: string) => ({ display_name })

  it('uses the one other person for a 1:1', () => {
    expect(deriveDmTitle([p('Ada Lovelace')])).toBe('Ada Lovelace')
  })

  it('falls back to a neutral word when there is nobody left', () => {
    // A conversation whose only other participant has left is not "undefined".
    expect(deriveDmTitle([])).toBe('Conversation')
  })

  it('uses first names for a group', () => {
    expect(deriveDmTitle([p('Ada Lovelace'), p('Ben Stone')])).toBe('Ada, Ben')
  })

  it('appends the +N overflow past three (the drift the dock had)', () => {
    const six = ['Ada L', 'Ben S', 'Cal T', 'Dee U', 'Eve V', 'Fay W'].map(p)
    expect(deriveDmTitle(six)).toBe('Ada, Ben, Cal +3')
  })

  it('does not append +0 at exactly three', () => {
    expect(deriveDmTitle([p('Ada L'), p('Ben S'), p('Cal T')])).toBe('Ada, Ben, Cal')
  })
})

describe('dmTitle', () => {
  const me = { id: 'me', display_name: 'Me Myself' }
  const ada = { id: 'a', display_name: 'Ada Lovelace' }
  const ben = { id: 'b', display_name: 'Ben Stone' }

  it('prefers the stored name', () => {
    expect(dmTitle('Sunday crew', [me, ada, ben], 'me')).toBe('Sunday crew')
  })

  it('derives when the name is null, excluding me', () => {
    expect(dmTitle(null, [me, ada, ben], 'me')).toBe('Ada, Ben')
  })

  it('treats an empty stored name as no name (renameConversation stores null, not "")', () => {
    expect(dmTitle('', [me, ada], 'me')).toBe('Ada Lovelace')
  })
})
