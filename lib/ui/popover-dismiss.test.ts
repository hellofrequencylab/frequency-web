// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POPOVER_DISMISS_SCRIPT } from './popover-dismiss'

// The script runs once per document, as it does from the root layout's <head>.
beforeAll(() => {
  new Function(POPOVER_DISMISS_SCRIPT)()
})

beforeEach(() => {
  document.body.innerHTML = `
    <details id="a" data-popover open><summary id="sa">More</summary>
      <a id="link" href="#x">Reviews</a><span id="text">label</span></details>
    <details id="b" data-popover><summary id="sb">Other</summary><a href="#y">Y</a></details>
    <details id="acc" open><summary>Accordion</summary><p>body</p></details>
    <p id="outside">page</p>`
})

const $ = (id: string) => document.getElementById(id)!
const click = (id: string) => $(id).dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('a <details data-popover> behaves like a popup', () => {
  it('closes on a click outside, and leaves a plain accordion alone', () => {
    click('outside')
    expect($('a').hasAttribute('open')).toBe(false)
    expect($('acc').hasAttribute('open')).toBe(true)
  })

  it('closes when an item inside it is picked', () => {
    click('link')
    expect($('a').hasAttribute('open')).toBe(false)
  })

  it('stays open on a click on its own non-interactive content', () => {
    click('text')
    expect($('a').hasAttribute('open')).toBe(true)
  })

  it('closes the others when another one is opened', () => {
    click('sb')
    expect($('a').hasAttribute('open')).toBe(false)
  })

  it('closes on Escape and hands focus back to its summary', () => {
    $('link').focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect($('a').hasAttribute('open')).toBe(false)
    expect(document.activeElement).toBe($('sa'))
    expect($('acc').hasAttribute('open')).toBe(true)
  })
})
