// The DOM half of Spark autosave (ADR-991): read the mounted controls, and put saved values back
// into them. Split out from the hook so it can be exercised on its own under jsdom, and so the
// React side has no querySelector in it.
//
// The SAME walk backs both directions, which is the point: a key means one thing whether it is being
// written or read, and the two can never drift apart.

import { fieldKey, isDraftable, type FieldDescriptor } from './draft-store'

const CONTROLS = 'input, textarea, select'

function describe(el: Element, index: number): FieldDescriptor {
  return {
    tag: el.tagName.toLowerCase() as FieldDescriptor['tag'],
    type: el.getAttribute('type'),
    id: el.getAttribute('id'),
    name: el.getAttribute('name'),
    ariaLabel: el.getAttribute('aria-label'),
    autocomplete: el.getAttribute('autocomplete'),
    optOut: el.getAttribute('data-spark-draft') === 'off',
    index,
  }
}

function walk(stage: HTMLElement, step: number, visit: (el: HTMLElement, key: string) => void): void {
  let index = 0
  stage.querySelectorAll<HTMLElement>(CONTROLS).forEach((el) => {
    const desc = describe(el, index)
    if (!isDraftable(desc)) return
    index += 1
    visit(el, fieldKey(desc, step))
  })
}

function readControl(el: HTMLElement): string {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return String(el.checked)
  return (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? ''
}

/**
 * Put a saved value back the way a person would, so React's own onChange runs and the wizard's state
 * moves with it. Setting `.value` alone is invisible to React: it keeps a tracker of the last value
 * it wrote and skips the event, hence the prototype setter before the dispatch.
 *
 * Returns false when the control cannot take the value YET (a choice whose options have not loaded),
 * so the value stays pending rather than being written as something invalid.
 */
function writeControl(el: HTMLElement, value: string): boolean {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    if (String(el.checked) !== value) el.click() // the event React listens to for a checkbox
    return true
  }

  if (el instanceof HTMLSelectElement) {
    if (!Array.from(el.options).some((o) => o.value === value)) return false
    if (el.value !== value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return true
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.value === value) return true
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  return false
}

/** What is on screen right now, by key. Refused controls (secrets, files, radios) are not read. */
export function collectValues(stage: HTMLElement, step: number): Record<string, string> {
  const out: Record<string, string> = {}
  walk(stage, step, (el, key) => {
    out[key] = readControl(el)
  })
  return out
}

/**
 * Fill whichever of `waiting` have a control on screen, and return what is still waiting for a later
 * step. Applied once per key: after that the wizard holds the value, so stepping back and forward
 * keeps any edit the author made to it.
 */
export function applyValues(
  stage: HTMLElement,
  step: number,
  waiting: Record<string, string>,
): Record<string, string> {
  const left = { ...waiting }
  walk(stage, step, (el, key) => {
    const value = left[key]
    if (value === undefined) return
    if (writeControl(el, value)) delete left[key]
  })
  return left
}
