// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyValues, collectValues } from './draft-dom'

/** A stage with the controls a Spark step actually mounts. `id` is what the Studio kit gives every
 *  declared control (its manifest path), so these ids are the real ones. */
function stage(html: string): HTMLElement {
  document.body.innerHTML = `<div id="stage">${html}</div>`
  return document.getElementById('stage') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('collecting what is on screen', () => {
  it('reads text, textarea, select and checkbox by their manifest id', () => {
    const el = stage(`
      <input id="answers.who" value="busy parents" />
      <textarea id="spark-source">a pasted outline</textarea>
      <select id="answers.pace"><option value="light">Light</option><option value="medium" selected>Medium</option></select>
      <input id="settings.public" type="checkbox" checked />
    `)
    expect(collectValues(el, 2)).toEqual({
      'f.answers-who': 'busy parents',
      'f.spark-source': 'a pasted outline',
      'f.answers-pace': 'medium',
      'f.settings-public': 'true',
    })
  })

  it('leaves secrets, files and radios out entirely', () => {
    const el = stage(`
      <input id="answers.who" value="kept" />
      <input id="pw" type="password" value="hunter2" />
      <input id="docs" type="file" />
      <input id="token" value="sk-live-123" />
      <input id="card" type="text" autocomplete="cc-number" value="4242" />
      <input id="pace" type="radio" name="pace" value="light" checked />
      <input id="notes" value="skipped" data-spark-draft="off" />
    `)
    expect(collectValues(el, 1)).toEqual({ 'f.answers-who': 'kept' })
  })

  it('gives an anonymous control a per-step key so two steps cannot collide', () => {
    const one = collectValues(stage('<textarea>first</textarea>'), 1)
    const two = collectValues(stage('<textarea>second</textarea>'), 2)
    expect(Object.keys(one)[0]).toBe('s1.textarea.0')
    expect(Object.keys(two)[0]).toBe('s2.textarea.0')
  })
})

describe('restoring into the mounted step', () => {
  it('puts the value back and fires the event React listens to', () => {
    const el = stage('<input id="answers.who" value="" />')
    const input = el.querySelector('input') as HTMLInputElement
    const heard = vi.fn()
    input.addEventListener('input', heard)

    applyValues(el, 1, { 'f.answers-who': 'busy parents' })

    expect(input.value).toBe('busy parents')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('keeps values whose step is not on screen yet, and clears the ones it applied', () => {
    const el = stage('<input id="answers.who" value="" />')
    const left = applyValues(el, 1, { 'f.answers-who': 'here', 'f.answers-outcome': 'later' })
    expect(left).toEqual({ 'f.answers-outcome': 'later' })
  })

  it('restores a choice, and waits when its options have not loaded', () => {
    const loaded = stage('<select id="answers.pace"><option value="light">Light</option><option value="medium">Medium</option></select>')
    expect(applyValues(loaded, 1, { 'f.answers-pace': 'medium' })).toEqual({})
    expect((loaded.querySelector('select') as HTMLSelectElement).value).toBe('medium')

    const empty = stage('<select id="answers.circle"></select>')
    expect(applyValues(empty, 1, { 'f.answers-circle': 'circle-7' })).toEqual({ 'f.answers-circle': 'circle-7' })
  })

  it('restores a checkbox in both directions, and leaves a matching one alone', () => {
    const on = stage('<input id="settings.public" type="checkbox" />')
    applyValues(on, 1, { 'f.settings-public': 'true' })
    expect((on.querySelector('input') as HTMLInputElement).checked).toBe(true)

    const off = stage('<input id="settings.public" type="checkbox" checked />')
    applyValues(off, 1, { 'f.settings-public': 'false' })
    expect((off.querySelector('input') as HTMLInputElement).checked).toBe(false)

    const same = stage('<input id="settings.public" type="checkbox" checked />')
    const box = same.querySelector('input') as HTMLInputElement
    const heard = vi.fn()
    box.addEventListener('click', heard)
    applyValues(same, 1, { 'f.settings-public': 'true' })
    expect(box.checked).toBe(true)
    expect(heard).not.toHaveBeenCalled()
  })

  it('never writes into a refused control, even if a key somehow matches', () => {
    const el = stage('<input id="pw" type="password" value="" />')
    const left = applyValues(el, 1, { 'f.pw': 'hunter2' })
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('')
    expect(left).toEqual({ 'f.pw': 'hunter2' })
  })

  it('round-trips: what one step collected is what a later visit puts back', () => {
    const first = stage('<input id="answers.who" value="busy parents" /><textarea id="spark-source">an outline</textarea>')
    const saved = collectValues(first, 1)

    const fresh = stage('<input id="answers.who" value="" /><textarea id="spark-source"></textarea>')
    expect(applyValues(fresh, 1, saved)).toEqual({})
    expect((fresh.querySelector('input') as HTMLInputElement).value).toBe('busy parents')
    expect((fresh.querySelector('textarea') as HTMLTextAreaElement).value).toBe('an outline')
  })
})
