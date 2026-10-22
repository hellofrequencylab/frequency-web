// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DEFAULT_FACE, type CardFace } from '@/lib/member-cards/face'

// LIVE-1282: the shared card face editor. The mode choice drives which controls show (the link field
// for 'link', the field switches for 'card'), the "What they see" preview follows it, a Space gets the
// cardholder perk, and Save routes to the owner's own action and prints its line.

const saveMyCardFace = vi.fn()
const saveSpaceCardFace = vi.fn()
vi.mock('@/lib/member-cards/actions', () => ({
  saveMyCardFace: (...a: unknown[]) => saveMyCardFace(...a),
  saveSpaceCardFace: (...a: unknown[]) => saveSpaceCardFace(...a),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const { CardFaceEditor } = await import('./card-face-editor')

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  saveMyCardFace.mockReset()
  saveSpaceCardFace.mockReset()
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

const stats = { taps: 12, saves: 3, swaps: 1 }

function mount(kind: 'member' | 'space', face: CardFace = DEFAULT_FACE) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <CardFaceEditor
        owner={kind === 'member' ? { kind: 'member', handle: 'ada' } : { kind: 'space', spaceId: 'sp1', slug: 'corner-cafe' }}
        name={kind === 'member' ? 'Ada Lane' : 'Corner Cafe'}
        avatarUrl={null}
        stageLabel={kind === 'member' ? 'Regular' : null}
        cardNumber={42}
        initialFace={face}
        stats={stats}
      />,
    ),
  )
  return container
}

function radio(c: HTMLElement, label: string): HTMLButtonElement {
  const el = [...c.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent?.includes(label))
  if (!el) throw new Error(`no choice ${label}`)
  return el
}
function button(c: HTMLElement, label: string): HTMLButtonElement {
  const el = [...c.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)
  if (!el) throw new Error(`no button ${label}`)
  return el
}

describe('CardFaceEditor', () => {
  it('shows the card, the three numbers and the three choices with page picked', () => {
    const c = mount('member')
    expect(c.textContent).toContain('No. 0042 · Regular')
    expect(c.textContent).toContain('Saved you')
    expect(c.textContent).toContain('12')
    const radios = c.querySelectorAll('[role="radio"]')
    expect(radios).toHaveLength(3)
    expect(radio(c, 'Open my page').getAttribute('aria-checked')).toBe('true')
    expect(c.textContent).toContain('/people/ada')
    expect(c.textContent).not.toContain('Cardholder perk')
  })

  it('shows the link field only for link, and the field switches only for card', () => {
    const c = mount('member')
    expect(c.querySelector('input[type="url"]')).toBeNull()
    act(() => radio(c, 'Open my link').click())
    expect(c.querySelector('input[type="url"]')).not.toBeNull()
    expect(c.textContent).not.toContain('Swap contacts')
    act(() => radio(c, 'Show my card').click())
    expect(c.querySelector('input[type="url"]')).toBeNull()
    expect(c.textContent).toContain('Ask them for theirs (Swap contacts)')
    expect(c.textContent).toContain('Save contact')
  })

  it('previews a paused card as paused', () => {
    const c = mount('member', { ...DEFAULT_FACE, paused: true })
    expect(c.textContent).toContain('This card is paused.')
  })

  it('saves a member face through saveMyCardFace and prints Saved', async () => {
    saveMyCardFace.mockResolvedValue({ data: { ...DEFAULT_FACE, mode: 'card' } })
    const c = mount('member')
    act(() => radio(c, 'Show my card').click())
    await act(async () => button(c, 'Save card').click())
    expect(saveMyCardFace).toHaveBeenCalledWith(expect.objectContaining({ mode: 'card' }))
    expect(saveSpaceCardFace).not.toHaveBeenCalled()
    expect(c.textContent).toContain('Saved')
  })

  it('prints the error line the action returns', async () => {
    saveMyCardFace.mockResolvedValue({ error: 'Add the link your card should open.' })
    const c = mount('member')
    act(() => radio(c, 'Open my link').click())
    await act(async () => button(c, 'Save card').click())
    expect(c.textContent).toContain('Add the link your card should open.')
  })

  it('gives a Space the cardholder perk and saves through saveSpaceCardFace', async () => {
    saveSpaceCardFace.mockResolvedValue({ data: DEFAULT_FACE })
    const c = mount('space')
    expect(c.textContent).toContain('Cardholder perk')
    expect(c.textContent).toContain('Corner Cafe')
    expect(c.textContent).toContain('/spaces/corner-cafe')
    expect(radio(c, 'Open our page').getAttribute('aria-checked')).toBe('true')
    await act(async () => button(c, 'Save card').click())
    expect(saveSpaceCardFace).toHaveBeenCalledWith('sp1', expect.objectContaining({ mode: 'page' }))
  })

  it('never names the staff reader or its console', () => {
    const c = mount('space')
    expect(c.textContent).not.toMatch(/CyberUnicorn|console/i)
  })
})
