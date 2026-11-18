import { describe, it, expect, afterEach, vi } from 'vitest'
import { conversationManageUrl } from './manage-emails-link'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-tokens'

const PROFILE = '11111111-1111-4111-8111-111111111111'

afterEach(() => vi.unstubAllEnvs())

describe('conversationManageUrl (EMAIL-079)', () => {
  it('signs a /manage-emails link the page will verify, in the lifecycle category', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-test-secret-test-secret')
    const url = new URL(conversationManageUrl(PROFILE)!)
    expect(url.pathname).toBe('/manage-emails')
    expect(url.searchParams.get('p')).toBe(PROFILE)
    expect(url.searchParams.get('c')).toBe('lifecycle')
    expect(verifyUnsubscribeToken(PROFILE, 'lifecycle', url.searchParams.get('t')!)).toBe(true)
  })

  it('is undefined for a contact with no profile', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-test-secret-test-secret')
    expect(conversationManageUrl(null)).toBeUndefined()
    expect(conversationManageUrl(undefined)).toBeUndefined()
    expect(conversationManageUrl('')).toBeUndefined()
  })

  it('is undefined, never a throw, when nothing can sign', () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(conversationManageUrl(PROFILE)).toBeUndefined()
  })
})
