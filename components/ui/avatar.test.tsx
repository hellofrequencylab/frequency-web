// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Avatar } from './avatar'
import { ProfileAvatar } from '@/components/profile/profile-avatar'
import { PulseAvatar } from '@/components/connections/pulse-avatar'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// Locks the ONE Avatar (DAWN core/Avatar) and the two things the consolidation had to get
// right or not do at all:
//
//   1. THE FOCAL POINT SURVIVES. `lib/images/avatar-focus.ts` (ADR-829) carries a member's
//      chosen crop as a `#fp=x,y` fragment ON the URL, so ~70 surfaces that only ever select
//      `avatar_url` get the focus for free. An avatar that renders the raw URL would ship the
//      fragment to the optimizer AND centre-crop every face. Both halves are asserted.
//   2. PRESENCE IS OPTIONAL AND NON-DISRUPTIVE. `components/presence/presence-dot.tsx` existed
//      but no avatar knew about it. Wiring it in must not add a wrapper to the surfaces that
//      have no presence to show, or every existing row shifts.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

describe('Avatar', () => {
  it('falls back to initials derived from the name, on the warm disc', () => {
    const c = mount(<Avatar src={null} name="Maya Ortiz" />)
    expect(c.querySelector('img')).toBeNull()
    const disc = c.firstElementChild!
    expect(disc.textContent).toBe('MO')
    expect(disc.className).toContain('bg-primary-bg')
    expect(disc.className).toContain('text-primary-strong')
    expect(disc.className).toContain('rounded-pill')
  })

  it('lets a caller override the initials (an entity mark is not always its letters)', () => {
    const c = mount(<Avatar src={null} name="The Frequency Collective" initials="FQ" />)
    expect(c.firstElementChild!.textContent).toBe('FQ')
  })

  it('strips the focal fragment from the src AND applies it as object-position', () => {
    const c = mount(<Avatar src="https://cdn.test/a.jpg#fp=30,68" name="Leo Park" />)
    const img = c.querySelector('img')!
    // The fragment must never reach the image request.
    expect(img.getAttribute('src')).toBe('https://cdn.test/a.jpg')
    expect(img.style.objectPosition).toBe('30% 68%')
    expect(img.getAttribute('alt')).toBe('Leo Park')
  })

  it('takes an explicit focus over the one carried in the URL', () => {
    const c = mount(
      <Avatar src="https://cdn.test/a.jpg#fp=30,68" name="Leo Park" focus="10% 90%" />,
    )
    expect(c.querySelector('img')!.style.objectPosition).toBe('10% 90%')
  })

  it('leaves object-position alone for an un-fragmented URL (today’s centred crop)', () => {
    const c = mount(<Avatar src="https://cdn.test/plain.jpg" name="Leo Park" />)
    const img = c.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://cdn.test/plain.jpg')
    expect(img.style.objectPosition).toBe('')
  })

  it('renders NO presence wrapper when presence is not in play', () => {
    // The whole point: an avatar on a surface with no presence is one element, exactly as
    // both predecessors were, so no existing row reflows.
    const c = mount(<Avatar src={null} name="Leo Park" />)
    expect(c.children.length).toBe(1)
    expect(c.firstElementChild!.tagName).toBe('SPAN')
    expect(c.firstElementChild!.className).not.toContain('relative')
    expect(c.querySelector('.bg-success')).toBeNull()
  })

  it('keeps the wrapper but hides the dot at online={false}, so it can appear without reflow', () => {
    const c = mount(<Avatar src={null} name="Leo Park" online={false} />)
    expect(c.firstElementChild!.className).toContain('relative')
    expect(c.querySelector('.bg-success')).toBeNull()
  })

  it('shows the presence dot at the size’s own diameter, named and reachable', () => {
    const small = mount(<Avatar src={null} name="Leo Park" size="sm" online />)
    const dot = small.querySelector('.bg-success')!
    expect(dot.className).toContain('h-2.5')
    expect(dot.getAttribute('aria-label')).toBe('Active now')

    const big = mount(<Avatar src={null} name="Maya Ortiz" size="xl" online />)
    const bigDot = big.querySelector('.bg-success')!
    // ONE diameter class, ever — `cn()` is a plain join and cannot resolve a conflict.
    expect(bigDot.className).toContain('h-4')
    expect(bigDot.className).not.toContain('h-2.5')
  })

  it('sizes off the named scale and rings only when asked', () => {
    const bare = mount(<Avatar src={null} name="Leo Park" size="sm" />)
    expect(bare.firstElementChild!.className).toContain('h-9 w-9')
    expect(bare.firstElementChild!.className).not.toContain('ring-4')

    const ringed = mount(<Avatar src={null} name="Maya Ortiz" size="xl" ring />)
    expect(ringed.firstElementChild!.className).toContain('sm:h-20')
    expect(ringed.firstElementChild!.className).toContain('ring-4 ring-surface')
  })

  it('dims through the shared .dimmed utility, never a one-off opacity', () => {
    const c = mount(<Avatar src="https://cdn.test/a.jpg" name="Demo Space" dimmed />)
    expect(c.querySelector('img')!.className).toContain('dimmed')
    expect(c.innerHTML).not.toMatch(/opacity-\[/)
  })

  it('paints no raw colour of its own', () => {
    const c = mount(<Avatar src={null} name="Leo Park" online />)
    expect(c.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(c.innerHTML).not.toMatch(/\b(rgb|hsl)a?\(/i)
  })
})

// ── The two avatars that compose it, still rendering what they always did ──────

describe('the avatars that compose it', () => {
  it('ProfileAvatar is the xl ringed step, focus and dimming intact', () => {
    const c = mount(
      <ProfileAvatar
        src="https://cdn.test/p.jpg#fp=45,20"
        name="Maya Ortiz"
        initials="MO"
        focus={null}
        dimmed
      />,
    )
    const img = c.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://cdn.test/p.jpg')
    // `focus={null}` means "no explicit choice", so the URL fragment still wins.
    expect(img.style.objectPosition).toBe('45% 20%')
    expect(img.className).toContain('h-16 w-16')
    expect(img.className).toContain('sm:h-20 sm:w-20')
    expect(img.className).toContain('ring-4 ring-surface')
    expect(img.className).toContain('dimmed')
  })

  it('ProfileAvatar still falls back to the initials it was handed', () => {
    const c = mount(<ProfileAvatar src={null} name="The Collective" initials="TC" />)
    expect(c.firstElementChild!.textContent).toBe('TC')
    expect(c.firstElementChild!.className).toContain('text-page-title')
  })

  it('PulseAvatar is still a link wrapping the sm step, with derived initials', () => {
    const c = mount(
      <PulseAvatar href="/people/leo" displayName="Leo Park" avatarUrl={null} />,
    )
    const link = c.querySelector('a')!
    expect(link.getAttribute('href')).toBe('/people/leo')
    expect(link.className).toContain('shrink-0')
    const disc = link.firstElementChild!
    expect(disc.textContent).toBe('LP')
    expect(disc.className).toContain('h-9 w-9')
  })

  it('PulseAvatar can now show presence — the thing neither old avatar could do', () => {
    const c = mount(
      <PulseAvatar href="/people/leo" displayName="Leo Park" avatarUrl={null} online />,
    )
    expect(c.querySelector('.bg-success')).not.toBeNull()
  })
})
