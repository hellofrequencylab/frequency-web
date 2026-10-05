import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE SIGN-IN LINK BUTTON SENDS (SCAN-751).
//
// admin.auth.admin.generateLink mints a link and never mails it (impersonate-actions relies on
// exactly that), so sendMagicLink told support "Sign-in link sent" while nothing went out. The
// action now sends through signInWithOtp, Supabase's mailer. Read statically: the module is a
// server-action file with forty imports, and the assertion is about which auth call is made.

const SRC = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')

function body(name: string): string {
  const i = SRC.indexOf(`export async function ${name}(`)
  expect(i, `${name} not found`).toBeGreaterThan(-1)
  const j = SRC.indexOf('\nexport async function ', i + 10)
  return SRC.slice(i, j < 0 ? SRC.length : j)
}

describe('sendMagicLink', () => {
  it('sends through signInWithOtp and never only mints with generateLink', () => {
    const s = body('sendMagicLink')
    expect(s).toMatch(/auth\.signInWithOtp\(/)
    expect(s).toMatch(/shouldCreateUser: false/)
    expect(s).not.toMatch(/generateLink\(/)
  })
})
