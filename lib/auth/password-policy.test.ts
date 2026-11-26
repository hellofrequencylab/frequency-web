import { describe, it, expect } from 'vitest'
import { PASSWORD_MIN_LENGTH, PASSWORD_HINT, passwordProblem } from './password-policy'

describe('the password rule (SEC-045)', () => {
  it('refuses anything under the floor and takes a passphrase at it', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('short')
    expect(passwordProblem('correct horse battery')).toBeNull()
  })

  it('demands no composition: lower-case letters and spaces alone pass', () => {
    expect(passwordProblem('tide pools at dawn')).toBeNull()
  })

  it('counts what a person sees, not UTF-16 units', () => {
    // 11 emoji are 22 UTF-16 units but 11 characters: still short.
    expect(passwordProblem('🌊'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('short')
  })

  it('refuses what bcrypt would silently truncate', () => {
    expect(passwordProblem('a'.repeat(73))).toBe('long')
    expect(passwordProblem('a'.repeat(72))).toBeNull()
  })

  it('refuses the email address as the password', () => {
    expect(passwordProblem('Someone.Long@example.com', 'someone.long@example.com')).toBe('email')
  })

  it('says the floor in the hint the form shows', () => {
    expect(PASSWORD_HINT).toContain(String(PASSWORD_MIN_LENGTH))
    expect(PASSWORD_HINT).not.toMatch(/—/)
  })
})
