// SEC-047: every email door (magic link, signup link, password sign-in, sign-up, reset) carries the
// invisible bot check's token to Supabase, every form that reaches one renders the widget, and the CSP
// lets Turnstile load. Fails naming each gap.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const actions = read('app/sign-in/actions.ts')

for (const fn of ['signInWithMagicLink', 'sendSignupLink', 'signInWithPassword', 'signUpWithPassword', 'requestPasswordReset']) {
  const body = actions.split(new RegExp(`export async function ${fn}\\(`))[1]?.split(/\nexport /)[0] ?? ''
  if (!/botCheckToken\(formData\)/.test(body) || !/captchaToken/.test(body.split('supabase.auth.')[1] ?? '')) {
    bad.push(`${fn} does not pass the bot-check token to Supabase`)
  }
  if (!/botCheckMissing\(captchaToken\)/.test(body)) bad.push(`${fn} does not answer a missing token itself`)
}
for (const [file, needle] of [
  ['app/sign-in/frequency-sign-in.tsx', '<BotCheck />'],
  ['app/sign-in/password-views.tsx', '<BotCheck />'],
  ['app/(main)/settings/account/section.tsx', '<BotCheck />'],
  ['app/join/(induction)/induction.tsx', 'fd.set(BOT_CHECK_FIELD'],
  ['app/join/(induction)/feature-funnel.tsx', 'fd.set(BOT_CHECK_FIELD'],
  ['components/frequency/site/pages/join/frequency-join.tsx', 'fd.set(BOT_CHECK_FIELD'],
]) {
  if (!read(file).includes(needle)) bad.push(`${file} sends without the bot check`)
}
const csp = read('next.config.ts')
if (!/script-src[^\n]*https:\/\/challenges\.cloudflare\.com/.test(csp) || !/frame-src[^\n]*https:\/\/challenges\.cloudflare\.com/.test(csp)) {
  bad.push('the CSP blocks Turnstile')
}
if (!/NEXT_PUBLIC_TURNSTILE_SITE_KEY=\s*$/m.test(read('.env.example'))) bad.push('site key missing from .env.example')
if (!read('docs/RUNBOOKS.md').includes('## Invisible bot check')) bad.push('no switch-on runbook')

if (bad.length) {
  console.error('SEC-047: ' + bad.join('; '))
  process.exit(1)
}
console.log('SEC-047: every email door carries the bot-check token and every form renders the widget')
