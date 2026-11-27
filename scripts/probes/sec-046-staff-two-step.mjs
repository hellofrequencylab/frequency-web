// SEC-046: every staff account must prove a two-step code (Supabase aal2) before /admin or a staff gate,
// and can set one up. Passes when each staff guard calls the step-up, the proxy refuses an admin server
// action without aal2, and the code and setup steps are wired to Supabase's verify; fails naming each gap.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const mfa = read('lib/auth/mfa.ts')
if (!/claims\?\.aal === 'aal2'/.test(mfa) || !/getClaims\(\)/.test(mfa)) bad.push('the step-up does not read aal from verified claims')
for (const [file, fn] of [
  ['lib/admin/guard.ts', 'requireAdmin'],
  ['lib/admin/guard.ts', 'requireAdminFloor'],
  ['lib/staff.ts', 'requireStaff'],
  ['lib/staff.ts', 'requireStaffCap'],
  ['lib/page-editor/guard.ts', 'requireJanitor'],
]) {
  const src = read(file)
  const body = src.split(new RegExp(`export async function ${fn}\\(`))[1]?.split(/\nexport /)[0] ?? ''
  if (!/requireStaffAal2\(/.test(body)) bad.push(`${fn} does not require a two-step code`)
}
const proxy = read('proxy.ts')
if (!/refuseAdminActionWithoutAal2\(/.test(proxy) || !/status: 403/.test(proxy)) bad.push('proxy.ts lets an admin server action run without aal2')
const actions = read('app/sign-in/mfa-actions.ts')
if (!/export async function verifyMfaCode[\s\S]*?challengeAndVerify\(/.test(actions)) bad.push('no code step action')
if (!/export async function verifyMfaEnrollment[\s\S]*?status === 'unverified'[\s\S]*?challengeAndVerify\(/.test(actions)) bad.push('setup does not verify the caller\'s own new factor')
if (!/rateLimitOk\('mfa:verify'/.test(actions)) bad.push('code tries are not limited')
const page = read('app/sign-in/page.tsx')
if (!page.includes("step === 'mfa'") || !page.includes("'mfa-setup'") || !/mfa\.enroll\(/.test(page)) bad.push('/sign-in has no code or setup step')
if (!/ADMIN_MFA_BYPASS=\s*$/m.test(read('.env.example'))) bad.push('break glass switch missing from .env.example')
if (!read('docs/RUNBOOKS.md').includes('## Two-step codes for staff')) bad.push('no runbook for a lost authenticator')

if (bad.length) {
  console.error('SEC-046: ' + bad.join('; '))
  process.exit(1)
}
console.log('SEC-046: staff guards and admin actions require a two-step code; code and setup steps are wired')
