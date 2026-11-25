// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sourceWithoutComments } from '@/test/source-shape'
import { SIGN_IN_ERRORS, signInErrorMessage } from './errors'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'
import { decodeSignInHint, encodeSignInHint, signInHintSentence } from '@/lib/auth/sign-in-hint'

// SEC-045: the third door. Frequency was passwordless from its first commit; these pin the password
// sign-in, its switch, and the rules that keep it from becoming the weak door.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('./actions', () => ({
  signInWithMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  setNewPassword: vi.fn(),
}))
vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), useFormStatus: () => ({ pending: false }) }))

const { FrequencySignIn } = await import('./frequency-sign-in')
const { CreateAccountView, ForgotPasswordView, NewPasswordView } = await import('./password-views')

const doc = (node: React.ReactNode) => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<>{node}</>)
  return host
}
const base = { errorMessage: null, nextValue: '', emailValue: '', hintSentence: null, newAccountEmail: null }

describe('the password form', () => {
  it('is email, password, forgot and one submit, with the managers told what each field is', () => {
    const d = doc(<FrequencySignIn {...base} method="password" />)
    const form = d.querySelectorAll('form')[0]
    expect(form.querySelector('input[name="email"]')?.getAttribute('autocomplete')).toBe('username')
    const pw = form.querySelector('input[name="password"]')!
    expect(pw.getAttribute('type')).toBe('password')
    expect(pw.getAttribute('autocomplete')).toBe('current-password')
    expect(pw.getAttribute('spellcheck')).toBe('false')
    expect(form.querySelector('a[href="/sign-in?step=forgot"]')?.textContent).toBe('Forgot your password?')
    // The Show toggle is a plain button, never a submit, and sits outside the field's label.
    const toggle = d.querySelector('button.fqa-pw-toggle')!
    expect(toggle.getAttribute('type')).toBe('button')
    expect(toggle.closest('label')).toBeNull()
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1)
  })

  it('keeps Google beside it and carries next through every switch', () => {
    const d = doc(<FrequencySignIn {...base} method="password" nextValue="/events/x" />)
    expect(d.querySelectorAll('form')).toHaveLength(2)
    for (const f of d.querySelectorAll('form')) expect(f.querySelector('input[name="next"]')?.getAttribute('value')).toBe('/events/x')
    expect(d.querySelector('a[href="/sign-in?method=link&next=%2Fevents%2Fx"]')).toBeTruthy()
    expect(d.querySelector('a[href="/sign-in?step=create&next=%2Fevents%2Fx"]')).toBeTruthy()
  })

  it('the magic-link view offers the password in one tap', () => {
    const d = doc(<FrequencySignIn {...base} />)
    expect(d.querySelector('input[name="password"]')).toBeNull()
    expect(d.querySelector('a[href="/sign-in?method=password"]')?.textContent).toBe('Sign in with your password')
  })

  it('the new-account step offers a password account too', () => {
    const d = doc(<FrequencySignIn {...base} newAccountEmail="new@b.co" />)
    expect(d.querySelector('a[href="/sign-in?step=create"]')).toBeTruthy()
  })
})

describe('the password steps', () => {
  it('create: email, a NEW password with the rule spelled out, and Google', () => {
    const d = doc(<CreateAccountView errorMessage={null} nextValue="/feed" emailValue="a@b.co" />)
    expect(d.querySelectorAll('h1')).toHaveLength(1)
    const pw = d.querySelector('input[name="password"]')!
    expect(pw.getAttribute('autocomplete')).toBe('new-password')
    expect(pw.getAttribute('minlength')).toBe(String(PASSWORD_MIN_LENGTH))
    expect(d.textContent).toContain(`At least ${PASSWORD_MIN_LENGTH} characters`)
    expect(d.querySelector<HTMLInputElement>('input[name="email"]')?.getAttribute('value')).toBe('a@b.co')
    expect(d.querySelectorAll('form')).toHaveLength(2)
  })

  it('forgot: one email field and nothing that says whether it is a member', () => {
    const d = doc(<ForgotPasswordView errorMessage={null} emailValue="" />)
    expect(d.querySelectorAll('input:not([type="hidden"])')).toHaveLength(1)
    expect(d.textContent).toMatch(/Never had a password here\? This sets your first\./)
  })

  it('new password: a hidden username for the manager and the masked address', () => {
    const d = doc(<NewPasswordView errorMessage="That reset link has expired. Ask for a new one." email="meg@gmail.com" maskedEmail="m•••@gmail.com" />)
    expect(d.querySelector('input[name="username"][autocomplete="username"]')?.hasAttribute('hidden')).toBe(true)
    expect(d.querySelector('.fqa-lead')?.textContent).toContain('m•••@gmail.com')
    expect(d.querySelector('input[name="password"]')?.getAttribute('aria-describedby')).toBe('sign-in-error')
  })

  it('no em dashes in any password screen (CONTENT-VOICE)', () => {
    for (const node of [
      <FrequencySignIn key="a" {...base} method="password" />,
      <CreateAccountView key="b" errorMessage={null} nextValue="" emailValue="" />,
      <ForgotPasswordView key="c" errorMessage={null} emailValue="" />,
      <NewPasswordView key="d" errorMessage={null} email="" maskedEmail={null} />,
    ]) expect(doc(node).textContent).not.toMatch(/—/)
  })
})

describe('the words never give away who has an account', () => {
  it('one sentence for a wrong address and a wrong password', () => {
    expect(SIGN_IN_ERRORS.credentials).not.toMatch(/no account|not found|wrong password|unknown/i)
    expect(signInErrorMessage('credentials')).toBe(SIGN_IN_ERRORS.credentials)
  })

  it('the length line states the real floor', () => {
    expect(SIGN_IN_ERRORS.short).toContain(String(PASSWORD_MIN_LENGTH))
  })
})

describe('the last-sign-in hint knows a password', () => {
  it('round-trips and says so', () => {
    const hint = decodeSignInHint(encodeSignInHint({ method: 'password', masked: 'm•••@gmail.com' }))
    expect(hint?.method).toBe('password')
    expect(signInHintSentence(hint!)).toBe('Last time you signed in with a password (m•••@gmail.com).')
  })
})

describe('the actions behind it (source shape)', () => {
  const src = sourceWithoutComments('app/sign-in/actions.ts')
  const page = sourceWithoutComments('app/sign-in/page.tsx')

  it('password tries are throttled per mailbox as well as per IP, and fail open like the rest', () => {
    expect(src).toMatch(/rateLimitOk\('signin:pw-ip'/)
    expect(src).toMatch(/rateLimitOk\('signin:pw-email', mailbox, PASSWORD_EMAIL_LIMIT/)
  })

  it('a password sign-in runs the callback steps (claims, hint, funnel) and clears the stashed next', () => {
    const fn = src.slice(src.indexOf('export async function signInWithPassword'), src.indexOf('export async function signUpWithPassword'))
    expect(fn).toContain('finishSignIn(supabase')
    expect(fn).toContain('jar.delete(POST_LOGIN_COOKIE)')
    expect(fn).not.toMatch(/console\.(error|log)\([^)]*(email|password)/)
  })

  it('sign-up and reset check the rule first and never say whether the address exists', () => {
    expect(src).toMatch(/passwordProblem\(password, email\)/)
    expect(src).toContain("redirect('/sign-in/confirm?sent=signup')")
    expect(src).toContain("redirect('/sign-in/confirm?sent=reset')")
  })

  it('a new password needs a fresh session and signs every other session out', () => {
    const fn = src.slice(src.indexOf('export async function setNewPassword'))
    expect(fn).toContain('RESET_FRESH_MS')
    expect(fn).toMatch(/signOut\(\{ scope: 'others' \}\)/)
  })

  it('the page picks the email form from a closed pair', () => {
    expect(page).toMatch(/method === 'password' \|\| method === 'link'/)
  })
})
