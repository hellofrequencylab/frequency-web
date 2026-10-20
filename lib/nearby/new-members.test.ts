import { describe, it, expect } from 'vitest'
import { pickNewMembers, type NewMemberRow } from './new-members'

const m = (id: string, over: Partial<NewMemberRow> = {}): NewMemberRow => ({
  id,
  display_name: `Member ${id}`,
  handle: id,
  avatar_url: null,
  created_at: '2026-10-19T00:00:00Z',
  ...over,
})

describe('pickNewMembers', () => {
  it('keeps newest-first order and caps the list', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id) => m(id))
    expect(pickNewMembers(rows, 'me', 3).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops members who opted out of the directory or are ghosting', () => {
    const rows = [m('a', { directory_visible: false }), m('b', { ghost_mode: true }), m('c')]
    expect(pickNewMembers(rows, 'me').map((r) => r.id)).toEqual(['c'])
  })

  it('drops the viewer and the system member', () => {
    const rows = [m('me'), m('vera', { is_system: true }), m('c')]
    expect(pickNewMembers(rows, 'me').map((r) => r.id)).toEqual(['c'])
  })

  it('drops a row with no name or no handle to link to', () => {
    const rows = [m('a', { display_name: ' ' }), m('b', { handle: null }), m('c')]
    expect(pickNewMembers(rows, 'me').map((r) => r.id)).toEqual(['c'])
  })
})
