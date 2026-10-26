import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { CoachProfileForm } from '@/components/spaces/coach-profile-form'
import { renderToStaticMarkup } from 'react-dom/server'
const m = vi.hoisted(() => ({ caller: vi.fn(), space: vi.fn(), access: vi.fn(), form: vi.fn(), coach: vi.fn(), discovery: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: m.caller }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: m.space }))
vi.mock('@/lib/spaces/private-state', () => ({ loadSpaceCoachProfile: m.coach, loadSpaceDiscoveryConsent: m.discovery }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: m.access }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found') } }))
vi.mock('@/components/templates/console-templates', () => ({ ConsoleFocusTemplate: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/spaces/staff-preview-banner', () => ({ StaffPreviewBanner: () => <aside>Read-only staff preview</aside> }))
vi.mock('@/components/spaces/coach-profile-form', () => ({ CoachProfileForm: (props: unknown) => { m.form(props); return <form /> } }))
vi.mock('@/components/spaces/discovery-coaching-panel', () => ({ DiscoveryCoachingPanel: () => <section>Discovery permission controls</section> }))
vi.mock('@/lib/spaces/console-back', () => ({ consoleBack: () => ({ href: '/spaces' }) }))
import Page from './page'
beforeEach(() => {
  vi.clearAllMocks()
  m.caller.mockResolvedValue({ id: 'editor-A', webRole: 'member' })
  m.space.mockResolvedValue({ id: 'space-A', slug: 'makers', name: 'Makers', preferences: { coachProfile: { goals: 'Return visits' } } })
  m.discovery.mockResolvedValue({ available: true, consent: null })
  m.coach.mockResolvedValue({ available: true, profile: { goals: 'Private return visits' } })
  m.access.mockResolvedValue({ canManage: true, staffViewing: false })
})
async function render() { return renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: 'makers' }) })) }
describe('coach settings access', () => {
  it('passes only resolved Space preferences to its owner editor form', async () => {
    await render()
    expect(m.space).toHaveBeenCalledExactlyOnceWith('makers', 'editor-A')
    expect(m.form).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'space-A', readOnly: false, initial: expect.objectContaining({ goals: 'Private return visits' }) }))
  })
  it('renders staff preview with a read-only form', async () => {
    m.access.mockResolvedValue({ canManage: false, staffViewing: true })
    expect(await render()).toContain('Read-only staff preview')
    expect(m.form.mock.calls[0][0].readOnly).toBe(true)
    expect(m.discovery).not.toHaveBeenCalled()
  })
  it('does not render preferences to an unrelated visitor', async () => {
    m.access.mockResolvedValue({ canManage: false, staffViewing: false })
    await expect(render()).rejects.toThrow('not-found')
    expect(m.coach).not.toHaveBeenCalled()
    expect(m.form).not.toHaveBeenCalled()
  })
})

it('shows unavailable without rendering public fallback preferences if private storage is missing', async () => {
  m.coach.mockResolvedValue({ available: false })
  expect(await render()).toContain('Coach preferences are unavailable')
  expect(m.form).not.toHaveBeenCalled()
})


it('keys the actual form by resolved tenant when navigating between Space settings', async () => {
  function formKey(node: ReactNode): string | null {
    if (Array.isArray(node)) {
      for (const child of node) { const key = formKey(child); if (key !== null) return key }
      return null
    }
    if (!isValidElement<{ children?: ReactNode }>(node)) return null
    if (node.type === CoachProfileForm) return node.key
    return formKey(node.props.children)
  }
  const pageA = await Page({ params: Promise.resolve({ slug: 'makers' }) })
  m.space.mockResolvedValue({ id: 'space-B', slug: 'gardeners', name: 'Gardeners' })
  m.coach.mockResolvedValue({ available: true, profile: { goals: 'B notes' } })
  const pageB = await Page({ params: Promise.resolve({ slug: 'gardeners' }) })
  expect(formKey(pageA)).toBe('space-A')
  expect(formKey(pageB)).toBe('space-B')
})
