// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { FieldDef } from '@/lib/studio/kernel/manifest'

// ─────────────────────────────────────────────────────────────────────────────
// THE FIELD KIT'S NATIVE FACE (ADR-1240).
//
// A RailAutosaveForm saves by reading its own FormData, so a kit control inside it has to answer
// to a column name. These pin the two things the rail depends on and the one guard it hands back:
//   • `name` and the manifest's `required` reach the native input, and nothing else does;
//   • a composite control (tags) takes no native name, because it is not one input;
//   • a closed select holding an OFF-LIST value keeps it selectable and marked (ADR-879), so the
//     FormData the rail reads back never turns a stored value into an empty submit.
// ─────────────────────────────────────────────────────────────────────────────

// The Loom picker is the one image control and reaches the network; nothing here renders an image.
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))

const { FieldControl } = await import('./field-control')

let root: Root | null = null
let host: HTMLElement | null = null

function mount(ui: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(ui))
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const TEXT: FieldDef = { path: 'title', label: 'Name', kind: 'text', section: 's', required: true }
const LONG: FieldDef = { path: 'description', label: 'Description', kind: 'longtext', section: 's' }
const CHOICE: FieldDef = {
  path: 'category',
  label: 'Category',
  kind: 'select',
  section: 's',
  options: [
    { value: 'mind', label: 'Mind' },
    { value: 'body', label: 'Body' },
  ],
}
const TAGS: FieldDef = { path: 'tags', label: 'Tags', kind: 'tags', section: 's' }

describe('FieldControl · the native name', () => {
  it('puts the name and the manifest required on a text input', () => {
    const el = mount(<FieldControl def={TEXT} name="title" value="" onChange={() => {}} />)
    const input = el.querySelector('input')!
    expect(input.getAttribute('name')).toBe('title')
    expect(input.required).toBe(true)
  })

  it('puts the name on a textarea and a select, and leaves required off an optional field', () => {
    const el = mount(
      <>
        <FieldControl def={LONG} name="description" value="" onChange={() => {}} />
        <FieldControl def={CHOICE} name="category" value="mind" onChange={() => {}} />
      </>,
    )
    expect(el.querySelector('textarea')!.getAttribute('name')).toBe('description')
    expect(el.querySelector('textarea')!.required).toBe(false)
    expect(el.querySelector('select')!.getAttribute('name')).toBe('category')
  })

  it('renders no native name when none is given (a staged wizard owns its values)', () => {
    const el = mount(<FieldControl def={TEXT} value="" onChange={() => {}} />)
    expect(el.querySelector('input')!.hasAttribute('name')).toBe(false)
  })

  it('gives a composite control no native name: it is not one input', () => {
    const el = mount(<FieldControl def={TAGS} name="tags" value={[]} onChange={() => {}} />)
    expect(el.querySelector('[name="tags"]')).toBeNull()
  })
})

describe('FieldControl · a closed select with an off-list value (ADR-879)', () => {
  it('keeps the stored value selected and marked, ahead of the declared choices', () => {
    const el = mount(<FieldControl def={CHOICE} name="category" value="spirit" onChange={() => {}} />)
    const select = el.querySelector('select')!
    expect(select.value).toBe('spirit')
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual(['Not set', 'spirit (not a standard choice)', 'Mind', 'Body'])
  })

  it('adds nothing when the value is on the list or empty', () => {
    const el = mount(
      <>
        <FieldControl def={CHOICE} id="a" value="body" onChange={() => {}} />
        <FieldControl def={CHOICE} id="b" value="" onChange={() => {}} />
      </>,
    )
    for (const select of Array.from(el.querySelectorAll('select'))) {
      expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Not set', 'Mind', 'Body'])
    }
  })
})
