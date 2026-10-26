// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ coach: vi.fn(), update: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/spaces/profile-settings', () => ({ updateSpaceProfile: mocks.update }))
vi.mock('@/app/(main)/spaces/copilot-actions', () => ({ suggestTaglineAction: mocks.coach }))
vi.mock('@/components/ui/image-upload', () => ({ ImageUpload: () => null }))
vi.mock('@/components/ui/header-image-field', () => ({ HeaderImageField: () => null }))
vi.mock('@/components/spaces/space-form', () => ({ AccentPicker: () => null }))
vi.mock('@/app/(main)/spaces/[slug]/manage/layout/actions', () => ({ setSpaceImages: vi.fn(), uploadSpaceImage: vi.fn(), setSpaceCoverScrim: vi.fn(), setSpaceLogoBackdrop: vi.fn(), setSpaceCoverFocus: vi.fn(), setSpaceAccent: vi.fn(), setSpaceHeaderCta: vi.fn(), setSpaceHeroLook: vi.fn() }))
vi.mock('@/components/frequency/admin/pages/space-reads', () => ({ loadSpaceCheckins: vi.fn() }))
vi.mock('@/lib/spaces/analytics', () => ({ getSpaceProfileEvidence: vi.fn() }))
import { SpaceCoachingCardView } from './dashboard/space-coaching-card'
import { setSpaceHeaderCta } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { SpaceBrandingForm } from './space-branding-form'
let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); window.history.replaceState(null, '', '/'); vi.clearAllMocks() })
it('keeps authored tagline through coaching and subsequent blur without saving questions', async () => {
  mocks.coach.mockResolvedValue({ data: 'Who should feel welcome here?' })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  act(() => root!.render(<SpaceBrandingForm spaceId="A" slug="makers" brandName="Makers" tagline="Our own line" coverScrim="none" accent="sky" defaultCtaLabel="Join" pageTheme="frequency" />))
  const field = container.querySelector('#tagline') as HTMLTextAreaElement
  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Coach me'))!
  await act(async () => button.click())
  expect(mocks.coach).toHaveBeenCalledWith('A', 'Our own line')
  expect(field.value).toBe('Our own line')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Who should feel welcome here?')
  act(() => { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
  expect(field.value).toBe('Our own line')
  expect(mocks.update).not.toHaveBeenCalled()
})


it('lands the coaching link on the real rendered Header button choices without saving anything', () => {
  const card = document.createElement('div')
  card.innerHTML = renderToStaticMarkup(<SpaceCoachingCardView slug="makers" identity={{ name: 'Makers', tagline: 'Make together', about: 'Our Space' }} observed={{ windowDays: 30, observedFrom: '2026-09-25T00:00:00.000Z', observedThrough: '2026-10-25T00:00:00.000Z', profileViews: 7, ctaClicks: 0 }} />)
  const link = Array.from(card.querySelectorAll('a')).find(a => a.textContent === 'Review your main button')!
  const destination = new URL(link.getAttribute('href')!, 'https://fixture.invalid')
  expect(destination.pathname).toBe('/spaces/makers/manage')
  expect(destination.searchParams.get('section')).toBe('settings')
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  act(() => root!.render(<SpaceBrandingForm spaceId="A" slug="makers" brandName="Makers" tagline="Our own line" coverScrim="none" accent="sky" defaultCtaLabel="Join" pageTheme="frequency" />))
  const target = container.querySelector(destination.hash)
  expect(target?.textContent).toBe('Header button')
  const fold = target!.closest('details')!
  expect(fold.open).toBe(false)
  const scroll = vi.fn()
  target!.scrollIntoView = scroll
  act(() => {
    window.history.replaceState(null, '', `${destination.pathname}${destination.search}${destination.hash}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(fold.open).toBe(true)
  expect(document.activeElement).toBe(target)
  expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  fold.open = false
  act(() => { window.history.replaceState(null, '', '#different-section'); window.dispatchEvent(new HashChangeEvent('hashchange')) })
  expect(fold.open).toBe(false)
  const choices = container.querySelector(`[role="group"][aria-labelledby="${target!.id}"]`)!
  expect(Array.from(choices.querySelectorAll('button')).map(button => button.textContent)).toEqual(['Default', 'Built in', 'Custom link'])
  expect(setSpaceHeaderCta).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})


it('reveals the Header button on an initial deep-linked mount without saving or changing other folds', () => {
  window.history.replaceState(null, '', '/spaces/makers/manage?section=settings#branding-cta-label')
  const scroll = vi.fn()
  HTMLElement.prototype.scrollIntoView = scroll
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  act(() => root!.render(<SpaceBrandingForm spaceId="A" slug="makers" brandName="Makers" tagline="Our own line" coverScrim="none" accent="sky" defaultCtaLabel="Join" pageTheme="frequency" />))
  const target = container.querySelector('#branding-cta-label')!
  expect(target.closest('details')?.open).toBe(true)
  expect(Array.from(container.querySelectorAll('details')).slice(1).every(fold => !fold.open)).toBe(true)
  expect(document.activeElement).toBe(target)
  expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  expect(setSpaceHeaderCta).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})
