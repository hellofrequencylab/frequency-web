import { describe, expect, it } from 'vitest'
import { ROLES, ROLE_IDS } from './roles'

// BLD-215: every role says where it appears. Site and profile draw it, Spotlight gets a door, and email either draws it, hides it
// (no email form) or freezes it (the rows are fixed at send, never live). The freeze rule is the audit's (v3-review-and-needs.md).
const HIDDEN = ['faq', 'gallery', 'business', 'contact', 'locations']
const FROZEN = ['stats', 'gatherings', 'membership', 'booking', 'offerings', 'chapters']

describe('role surfaces', () => {
  it('declares all four surfaces for every role', () => {
    for (const id of ROLE_IDS) {
      expect(ROLES[id].surfaces, id).toMatchObject({ site: 'draw', profile: 'draw', spotlight: 'door' })
      expect(['draw', 'hide', 'freeze'], id).toContain(ROLES[id].surfaces.email)
    }
  })
  it('hides the roles with no email form and freezes the ones that read live rows', () => {
    for (const id of ROLE_IDS) expect(ROLES[id].surfaces.email, id).toBe(HIDDEN.includes(id) ? 'hide' : FROZEN.includes(id) ? 'freeze' : 'draw')
  })
  it('freezes every role that reads the Space\'s rows, so no live number is sent in an email', () => {
    for (const id of ROLE_IDS) if (ROLES[id].data) expect(ROLES[id].surfaces.email, id).not.toBe('draw')
  })
})
