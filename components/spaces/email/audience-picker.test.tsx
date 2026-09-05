// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// AUDIENCE PICKER EDIT MODE (scan2 L9-08). Before this change a saved segment could be created and
// deleted but never renamed from the Space UI. Locked here: with a saved segment selected, the
// management row shows that segment's name in an editable field, and Save name calls the
// updateSpaceSegment server action with (spaceId, slug, id, newName). With nothing selected, the
// row is still the create form. Both assertions fail against the pre-change component (no rename
// field, no updateSpaceSegment import).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/spaces/campaigns-actions', () => ({
  countSpaceAudience: async () => 3,
}))
const updateSpaceSegment = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/spaces/segments-actions', () => ({
  createSpaceSegment: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  updateSpaceSegment: (...a: unknown[]) => updateSpaceSegment(...(a as [])),
  deleteSpaceSegment: vi.fn(async () => ({ ok: true })),
}))

const { AudiencePicker } = await import('./audience-picker')

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

const SEGMENTS = [{ id: 'seg-1', name: 'Regulars' }]

describe('AudiencePicker edit mode', () => {
  it('shows the selected segment name in a rename field and saves through updateSpaceSegment', async () => {
    await render(
      <AudiencePicker
        spaceId="space-A"
        slug="river-studio"
        tags={[]}
        segments={SEGMENTS}
        filter={{ segmentId: 'seg-1' }}
        onFilterChange={() => {}}
      />,
    )
    const field = container!.querySelector<HTMLInputElement>('input[aria-label="Segment name"]')
    expect(field).not.toBeNull()
    expect(field!.value).toBe('Regulars')

    const button = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('Save name'))!
    expect(button).toBeTruthy()
    expect(button.disabled).toBe(true) // unchanged name: nothing to save

    await act(async () => setInputValue(field!, 'Regulars (Tuesday)'))
    expect(button.disabled).toBe(false)
    await act(async () => button.click())
    expect(updateSpaceSegment).toHaveBeenCalledWith('space-A', 'river-studio', 'seg-1', 'Regulars (Tuesday)')
  })

  it('keeps the create form when no saved segment is selected', async () => {
    await render(
      <AudiencePicker
        spaceId="space-A"
        slug="river-studio"
        tags={[]}
        segments={SEGMENTS}
        filter={{ tag: null }}
        onFilterChange={() => {}}
      />,
    )
    expect(container!.querySelector('input[aria-label="Segment name"]')).toBeNull()
    expect(container!.textContent).toContain('Save this as a segment')
  })
})
