// SEC-045: a member can sign in with an email and password, beside the magic link and Google, and can
// create, reset and set one. Passes when every door exists and is wired to the auth call that makes it
// real; fails naming each missing piece.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const actions = read('app/sign-in/actions.ts')
const view = read('app/sign-in/frequency-sign-in.tsx')

if (!/export async function signInWithPassword[\s\S]*?supabase\.auth\.signInWithPassword\(/.test(actions)) bad.push('no password sign-in action')
if (!/export async function signUpWithPassword[\s\S]*?supabase\.auth\.signUp\(/.test(actions)) bad.push('no password sign-up action')
if (!/export async function requestPasswordReset[\s\S]*?resetPasswordForEmail\(/.test(actions)) bad.push('no reset email')
if (!/export async function setNewPassword[\s\S]*?updateUser\(\{ password \}\)[\s\S]*?scope: 'others'/.test(actions)) bad.push('setting a password does not end the other sessions')
if (!/rateLimitOk\('signin:pw-email'/.test(actions)) bad.push('password tries are not limited per mailbox')
if (!/finishSignIn\(supabase/.test(actions)) bad.push('a password sign-in skips the post-sign-in claims')
if (!/action=\{signInWithPassword\}/.test(view) || !/action=\{signInWithGoogle\}/.test(view) || !/action=\{signInWithMagicLink\}/.test(view)) bad.push('/sign-in does not offer all three doors')
const page = read('app/sign-in/page.tsx')
for (const step of ['create', 'forgot', 'new-password']) {
  if (!page.includes(`step === '${step}'`)) bad.push(`/sign-in has no ${step} step`)
}
for (const [p, call] of [
  ['app/sign-in/password-views.tsx', 'signUpWithPassword'],
  ['app/sign-in/password-views.tsx', 'requestPasswordReset'],
  ['app/sign-in/password-views.tsx', 'setNewPassword'],
  ['app/(main)/settings/account/section.tsx', 'requestPasswordReset'],
]) {
  if (!read(p).includes(`action={${call}}`)) bad.push(`${p} does not post ${call}`)
}
if (!/PASSWORD_MIN_LENGTH = \d+/.test(read('lib/auth/password-policy.ts'))) bad.push('no password length rule')

if (bad.length) {
  console.error('SEC-045: ' + bad.join('; '))
  process.exit(1)
}
console.log('SEC-045: password sign-in, sign-up, reset and set-in-Settings are wired beside the magic link and Google')
