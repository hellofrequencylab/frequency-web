// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// TEMPLATE PICKER EDIT MODE (scan2 L9-08). Before this change a saved template could be created and
// deleted but never edited from the Space UI. Locked here: picking a template turns the save row into
// an update row (its name editable), and Update template calls updateSpaceEmailTemplate with the
// composer's CURRENT subject + body, so "update" means "make the template say what I have written".
// Fails against the pre-change component (no update row, no updateSpaceEmailTemplate import).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}))
const updateSpaceEmailTemplate = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/spaces/email-templates-actions', () => ({
  createSpaceEmailTemplate: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  updateSpaceEmailTemplate: (...a: unknown[]) => updateSpaceEmailTemplate(...(a as [])),
  deleteSpaceEmailTemplate: vi.fn(async () => ({ ok: true })),
}))

const { TemplatePicker } = await import('./template-picker')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

async function render(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function selectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const TEMPLATES = [{ id: 'tpl-1', name: 'Welcome', subject: 'Old subject', body: 'Old body' }]

describe('TemplatePicker edit mode', () => {
  it('turns the save row into an update row for the picked template and writes the current draft', async () => {
    const onLoad = vi.fn()
    await render(
      <TemplatePicker
        spaceId="space-A"
        slug="river-studio"
        templates={TEMPLATES}
        currentSubject="New subject"
        currentBody="New body"
        onLoadTemplate={onLoad}
      />,
    )
    // Nothing picked: the create form.
    expect(container!.textContent).toContain('Save this draft as a template')
    expect(container!.querySelector('input[aria-label="Template name"]')).toBeNull()

    const select = container!.querySelector('select')!
    await act(async () => selectValue(select, 'tpl-1'))
    expect(onLoad).toHaveBeenCalledWith('Old subject', 'Old body')

    const field = container!.querySelector<HTMLInputElement>('input[aria-label="Template name"]')
    expect(field).not.toBeNull()
    expect(field!.value).toBe('Welcome')
    expect(container!.textContent).not.toContain('Save this draft as a template')

    await act(async () => setInputValue(field!, 'Welcome v2'))
    const button = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('Update template'))!
    await act(async () => button.click())
    expect(updateSpaceEmailTemplate).toHaveBeenCalledWith('space-A', 'river-studio', 'tpl-1', 'Welcome v2', 'New subject', 'New body')
  })
})
