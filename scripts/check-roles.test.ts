import { describe, expect, it } from 'vitest'
import { checkRoles, roleProblems } from './check-roles.mjs'

const vocab = { groups: ['Welcome'], thumbs: ['split'], icons: new Set(['photo']) }
const good = {
  type: 'RoleX', intent: 'Say who you are', why: 'The first thing people see.', group: 'Welcome', icon: 'photo', live: false, default: 'split',
  variants: { split: { label: 'Split', thumb: 'split', needs: ['image'] } },
  slots: { required: { title: 'text<=120' }, optional: { image: 'image' }, labels: { title: { label: 'Headline', hint: 'The first line.' }, image: { label: 'Photo', hint: 'A real photo.' } } },
}

describe('check:roles (BLD-201)', () => {
  it('passes every role file in the tree', () => {
    const { roles, problems } = checkRoles()
    expect(roles).toBeGreaterThanOrEqual(21)
    expect(problems).toEqual([])
  })
  it('passes a whole contract', () => expect(roleProblems('x', good, vocab)).toEqual([]))
  it('fails an icon the sprite lacks', () => expect(roleProblems('x', { ...good, icon: 'sparkle' }, vocab)).toEqual(['x: icon "sparkle" is not in the sprite']))
  it('fails a variant with no thumb, and a slot with no label', () => {
    const bad = { ...good, variants: { split: { label: 'Split' } }, slots: { ...good.slots, labels: { title: good.slots.labels.title } } }
    expect(roleProblems('x', bad, vocab)).toEqual(['x: variant split thumb "undefined" is not one of ROLE_THUMBS', 'x: slot image has no label and hint'])
  })
  it('fails a missing intent and an unknown group', () => {
    expect(roleProblems('x', { ...good, intent: '', group: 'Elsewhere' }, vocab)).toEqual(['x: no intent', 'x: group "Elsewhere" is not one of Welcome'])
  })
})
