// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MembershipJoinDialog } from './membership-join-dialog'

// THE MEMBERSHIP POP-UP (LIVE-510), and the one claim about it worth pinning.
//
// The panel is the SERVER-rendered join surface, handed in as `children`. That is the whole reason
// the split exists: if this component ever grew its own tier fetch, the browser bundle would carry a
// second copy of the tier model and the prices in the dialog could disagree with the prices on the
// Memberships tab. These tests hold the seam by asserting the dialog renders what it is GIVEN, and
// that the trigger is a real, reachable control before anything is open.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

function mount(children: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <MembershipJoinDialog label="See memberships" heading="Become a member">
        {children}
      </MembershipJoinDialog>,
    )
  })
}

const trigger = () =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'See memberships')

describe('MembershipJoinDialog', () => {
  it('renders the operator label on a real button, and nothing else, before it is opened', () => {
    mount(<p>PANEL BODY</p>)
    expect(trigger()).toBeTruthy()
    // The panel is NOT in the document until the button is pressed: a dialog that painted its own
    // contents into the page would be a second copy of the plans surface stacked under the band.
    expect(document.body.textContent).not.toContain('PANEL BODY')
  })

  it('opens onto the children it was GIVEN, never a panel it built itself', () => {
    mount(<p>PANEL BODY</p>)
    act(() => trigger()!.click())
    expect(document.body.textContent).toContain('PANEL BODY')
    expect(document.body.textContent).toContain('Become a member')
  })

  it('names itself by its visible heading rather than restating it in an aria-label', () => {
    mount(<p>PANEL BODY</p>)
    act(() => trigger()!.click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    const labelledBy = dialog!.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(dialog!.getAttribute('aria-label')).toBeNull()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Become a member')
  })

  it('closes again, so the band is not left behind a stuck overlay', () => {
    mount(<p>PANEL BODY</p>)
    act(() => trigger()!.click())
    expect(document.body.textContent).toContain('PANEL BODY')
    const close = Array.from(document.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Close',
    )
    expect(close).toBeTruthy()
    act(() => close!.click())
    expect(document.body.textContent).not.toContain('PANEL BODY')
  })
})
