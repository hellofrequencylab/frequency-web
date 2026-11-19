import { describe, it, expect } from 'vitest'
import { PERSONAL_LIST_SENDER_ERROR, personalListSenderError } from './personal-list'

describe('personalListSenderError (EMAIL-082)', () => {
  it('lets mail to the personal list through only when it is sent as Daniel Tyack', () => {
    expect(personalListSenderError('imported_contacts', 'Daniel Tyack')).toBeNull()
    expect(personalListSenderError('imported_contacts', '  daniel   tyack ')).toBeNull()
  })

  it.each([null, '', 'Frequency', 'Frequency Team', 'Dan'])('refuses the personal list from %j', (name) => {
    expect(personalListSenderError('imported_contacts', name)).toBe(PERSONAL_LIST_SENDER_ERROR)
  })

  it('never touches any other audience', () => {
    expect(personalListSenderError('members', 'Frequency')).toBeNull()
    expect(personalListSenderError('all_contacts', null)).toBeNull()
  })
})
