import { describe, expect, it } from 'vitest'
import { canSeeSpaceContactTab, readContactFormContent, type ContactDoorFacts } from './contact-tab'

// THE CONTACT TAB's two pure questions, pinned.
//
// The one that matters most is `readContactFormContent`: the tab draws the operator's authored copy
// from the `contactForm` BLOCK's own content bag rather than from a node of its own. If that reader
// ever starts looking somewhere else, the same sentence lives in two places, an operator edits one
// of them, and the form on Home and the form on this tab quietly say different things. These cases
// are what stops that being discovered by a member.

function facts(over: Partial<ContactDoorFacts> = {}): ContactDoorFacts {
  return { spaceType: 'business', hasFormBlock: false, hasContactFacts: false, canManage: false, ...over }
}

/** A saved layout carrying an authored contactForm bag, in the shape parseEntityLayout accepts. */
function prefsWithForm(bag: Record<string, unknown>) {
  return { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['contactForm']] }], content: { contactForm: bag } } }
}

describe('readContactFormContent', () => {
  it('reads the contactForm block bag off the saved layout', () => {
    const out = readContactFormContent(prefsWithForm({ title: 'Work with us', showPhone: true }))
    expect(out.title).toBe('Work with us')
    expect(out.showPhone).toBe(true)
  })

  it('returns an empty bag when the operator never placed the block', () => {
    expect(readContactFormContent({ profileLayout: { rows: [] } })).toEqual({})
  })

  // FAIL-SAFE, and it is the common case on a Space that has never laid out a page: the tab still
  // renders a working form with its default wording rather than throwing on the way in.
  it('survives a missing, malformed or non-object preferences node', () => {
    for (const bad of [null, undefined, 'nope', 42, [], {}, { profileLayout: 'broken' }, { profileLayout: null }]) {
      expect(readContactFormContent(bad)).toEqual({})
    }
  })

  it('refuses a non-object bag rather than handing the form an array', () => {
    expect(readContactFormContent({ profileLayout: { content: { contactForm: ['x'] } } })).toEqual({})
  })
})

describe('canSeeSpaceContactTab', () => {
  it('offers the tab once the operator has authored a form', () => {
    expect(canSeeSpaceContactTab(facts({ hasFormBlock: true }))).toBe(true)
  })

  it('offers it on published contact facts alone', () => {
    expect(canSeeSpaceContactTab(facts({ hasContactFacts: true }))).toBe(true)
  })

  // 🔴 THE DEFAULT IS OFF, AND THAT IS DELIBERATE. This form writes a CRM lead and notifies the
  // owner. Turning a public lead door on for every Space on the platform is a product decision, not
  // a side effect of adding a tab, so a Space that has done neither thing gets no tab.
  it('stays closed on a Space that has done neither', () => {
    expect(canSeeSpaceContactTab(facts())).toBe(false)
  })

  // The manager carve-out every sibling tab carries: for them an empty tab is a to-do, and it is
  // where the setup lives.
  it('shows a manager the tab at zero', () => {
    expect(canSeeSpaceContactTab(facts({ canManage: true }))).toBe(true)
  })

  // ROOT never offers it, and the manager carve-out does not reopen it — the same leak class the
  // Circles and Discussion gates close.
  it('never offers it on root, not even to a manager', () => {
    expect(canSeeSpaceContactTab(facts({ spaceType: 'root', canManage: true, hasFormBlock: true }))).toBe(false)
  })
})
