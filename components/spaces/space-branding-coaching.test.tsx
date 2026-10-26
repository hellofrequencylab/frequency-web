// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ coach: vi.fn(), update: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/spaces/profile-settings', () => ({ updateSpaceProfile: mocks.update }))
vi.mock('@/app/(main)/spaces/copilot-actions', () => ({ suggestTaglineAction: mocks.coach }))
vi.mock('@/components/ui/image-upload', () => ({ ImageUpload: () => null }))
vi.mock('@/components/ui/header-image-field', () => ({ HeaderImageField: () => null }))
vi.mock('@/components/spaces/space-form', () => ({ AccentPicker: () => null }))
vi.mock('@/app/(main)/spaces/[slug]/manage/layout/actions', () => ({ setSpaceImages: vi.fn(), uploadSpaceImage: vi.fn(), setSpaceCoverScrim: vi.fn(), setSpaceLogoBackdrop: vi.fn(), setSpaceCoverFocus: vi.fn(), setSpaceAccent: vi.fn(), setSpaceHeaderCta: vi.fn(), setSpaceHeroLook: vi.fn() }))
import { SpaceBrandingForm } from './space-branding-form'
let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); vi.clearAllMocks() })
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
