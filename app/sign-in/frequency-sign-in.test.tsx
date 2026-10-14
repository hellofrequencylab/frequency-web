// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// THE DOORWAY UNDER FREQUENCY (ADR-1737): sign-in, its new-account step, "check your email" and the
// system screens wear the Commons frame with the site wordmark, and keep every field the actions read.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('./actions', () => ({ signInWithMagicLink: vi.fn(), signInWithGoogle: vi.fn() }))
vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), useFormStatus: () => ({ pending: false }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/x' }))

const { FrequencySignIn } = await import('./frequency-sign-in')
const { default: ConfirmPage } = await import('./confirm/page')
const { MemberNotFound, MemberError } = await import('@/components/frequency/members/member-status')

const doc = (node: React.ReactNode) => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<>{node}</>)
  return host
}

const base = { errorMessage: null, nextValue: '', emailValue: '', hintSentence: null, newAccountEmail: null }

describe('sign-in under Frequency', () => {
  it('is the doorway frame: wordmark home, one h1, kit fields and buttons, no DAWN photo hero', () => {
    const d = doc(<FrequencySignIn {...base} />)
    expect(d.querySelector('main.fqa a.fqa-mark')?.getAttribute('href')).toBe('/')
    expect(d.querySelector('a.fqa-mark')?.getAttribute('aria-label')).toBe('Frequency home')
    expect(d.querySelectorAll('h1')).toHaveLength(1)
    expect(d.querySelector('h1')?.textContent).toBe('Sign in')
    expect(d.querySelector('label.field input.input[type="email"][name="email"]')).toBeTruthy()
    expect(d.querySelectorAll('button[type="submit"].btn')).toHaveLength(2)
    expect(d.innerHTML).not.toMatch(/rounded-card|bg-surface\/95|shadow-pop/)
  })

  it('keeps the mode and the validated next on both forms', () => {
    const d = doc(<FrequencySignIn {...base} nextValue="/events/x" emailValue="a@b.co" />)
    const forms = d.querySelectorAll('form')
    expect(forms).toHaveLength(2)
    expect(forms[0].querySelector('input[name="mode"]')?.getAttribute('value')).toBe('signin')
    for (const f of forms) expect(f.querySelector('input[name="next"]')?.getAttribute('value')).toBe('/events/x')
    expect(d.querySelector<HTMLInputElement>('input[name="email"]')?.getAttribute('value')).toBe('a@b.co')
  })

  it('announces an error and ties it to the field', () => {
    const d = doc(<FrequencySignIn {...base} errorMessage="That link has expired." />)
    const alert = d.querySelector('[role="alert"]')!
    expect(alert.textContent).toBe('That link has expired.')
    expect(d.querySelector('input[name="email"]')?.getAttribute('aria-describedby')).toBe(alert.id)
  })

  it('asks before creating an account, posting mode=create with the address and next', () => {
    const d = doc(<FrequencySignIn {...base} newAccountEmail="new@b.co" nextValue="/feed" />)
    expect(d.querySelector('h1')?.textContent).toBe('No account for that email yet')
    const form = d.querySelector('form')!
    expect(form.querySelector('input[name="mode"]')?.getAttribute('value')).toBe('create')
    expect(form.querySelector('input[name="email"]')?.getAttribute('value')).toBe('new@b.co')
    expect(d.querySelector('a.fqa-link')?.getAttribute('href')).toBe('/sign-in?next=%2Ffeed')
  })

  it('no em dashes in the copy (CONTENT-VOICE)', () => {
    for (const node of [<FrequencySignIn key="a" {...base} />, <FrequencySignIn key="b" {...base} newAccountEmail="x@y.co" />]) {
      expect(doc(node).textContent).not.toMatch(/—/)
    }
  })
})

describe('check your email under Frequency', () => {
  it('is the same frame with the way back home', () => {
    const d = doc(<ConfirmPage />)
    expect(d.querySelector('main.fqa h1')?.textContent).toBe('Check your email')
    expect(d.querySelector('a[href="/sign-in"]')).toBeTruthy()
    expect(d.querySelector('button.btn')?.textContent).toContain('Back to home')
  })
})

describe('the member status screens', () => {
  it('not found: an h1 and real ways back in, Feed first', () => {
    const d = doc(<MemberNotFound />)
    expect(d.querySelector('.empty.mu-empty h1')).toBeTruthy()
    expect([...d.querySelectorAll('a.btn')].map((a) => a.getAttribute('href'))).toEqual([
      '/feed',
      '/events',
      '/search',
      '/help',
    ])
  })
  it('error: a retry first, and the reason announced', () => {
    const d = doc(<MemberError error={new Error('x')} reset={() => {}} />)
    expect(d.querySelector('button.btn.pa')?.textContent).toBe('Try again')
    expect(d.querySelector('[role="alert"]')).toBeTruthy()
  })
})
