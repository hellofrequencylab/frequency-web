import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMfaBypassed, refuseAdminActionWithoutAal2, stepUpPath } from './mfa-policy'

// SEC-046: the pure half of the staff two-step rule.

afterEach(() => vi.unstubAllEnvs())

const action = { method: 'POST', pathname: '/admin/members', isServerAction: true }

describe('stepUpPath', () => {
  it('sends someone with an authenticator to the code step, and someone without to setup', () => {
    expect(stepUpPath(true, '/admin/crm')).toBe('/sign-in?step=mfa&next=%2Fadmin%2Fcrm')
    expect(stepUpPath(false, '/admin')).toBe('/sign-in?step=mfa-setup&next=%2Fadmin')
  })
  it('never carries an off-site destination', () => {
    expect(stepUpPath(true, '//evil.com')).toBe('/sign-in?step=mfa&next=%2Fadmin')
    expect(stepUpPath(true, 'https://evil.com')).toBe('/sign-in?step=mfa&next=%2Fadmin')
  })
})

describe('refuseAdminActionWithoutAal2', () => {
  it('refuses an admin server action from a session that has not passed a code', () => {
    expect(refuseAdminActionWithoutAal2({ ...action, aal: 'aal1' })).toBe(true)
    expect(refuseAdminActionWithoutAal2({ ...action, aal: undefined })).toBe(true)
    expect(refuseAdminActionWithoutAal2({ ...action, pathname: '/admin', aal: 'aal1' })).toBe(true)
  })
  it('lets a two-step session through', () => {
    expect(refuseAdminActionWithoutAal2({ ...action, aal: 'aal2' })).toBe(false)
  })
  it('leaves page loads, other paths and look-alike paths alone', () => {
    expect(refuseAdminActionWithoutAal2({ ...action, method: 'GET', aal: 'aal1' })).toBe(false)
    expect(refuseAdminActionWithoutAal2({ ...action, isServerAction: false, aal: 'aal1' })).toBe(false)
    expect(refuseAdminActionWithoutAal2({ ...action, pathname: '/feed', aal: 'aal1' })).toBe(false)
    expect(refuseAdminActionWithoutAal2({ ...action, pathname: '/administer', aal: 'aal1' })).toBe(false)
  })
  it('stands down only while break glass is set', () => {
    expect(adminMfaBypassed()).toBe(false)
    vi.stubEnv('ADMIN_MFA_BYPASS', '1')
    expect(adminMfaBypassed()).toBe(true)
    expect(refuseAdminActionWithoutAal2({ ...action, aal: 'aal1' })).toBe(false)
  })
})
