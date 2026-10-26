import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const m = vi.hoisted(() => ({ allowed: true, configured: true, limited: false, propertyAllowed: true, attempt: true, events: [] as string[] }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error('REDIRECT:' + url) }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/spaces/discovery-access', () => ({ authorizeDiscoveryEditor: vi.fn(async () => { m.events.push('authorize'); return m.allowed ? { actor: 'owner', space: { slug: 'alpha' } } : null }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => { m.events.push('rate'); return !m.limited }) }))
vi.mock('@/lib/ai/discovery-connection-store', () => ({ beginSearchConnection: vi.fn(async () => { m.events.push('begin'); return m.attempt ? { state: 'opaque-state', challenge: 'pkce-challenge', connectionId: 'generation' } : null }), disconnectSearchConnection: vi.fn(async () => true) }))
vi.mock('@/lib/ai/discovery-search-runtime', () => ({ searchPropertyAllowed: vi.fn(async () => { m.events.push('scope'); return m.propertyAllowed ? 'page_urls' : null }), reviewSearchSignals: vi.fn(async () => ({ status: 'unavailable', reason: 'consent_or_permission_required' })) }))
vi.mock('@/lib/integrations/discovery/oauth', () => ({ searchProvider: (v: string) => v === 'google' ? 'google_search_console' : null, searchOAuthConfig: () => m.configured ? { clientId: 'fixture', clientSecret: 'private-client-secret' } : null, searchAuthorizationUrl: vi.fn((_provider: string, state: string, challenge: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&code_challenge=${challenge}`) }))
import { startSearchProvider, disconnectSearchProvider, reviewConnectedSearch } from './search-actions'
import { beginSearchConnection, disconnectSearchConnection } from '@/lib/ai/discovery-connection-store'
import { searchAuthorizationUrl } from '@/lib/integrations/discovery/oauth'
import { reviewSearchSignals } from '@/lib/ai/discovery-search-runtime'
const form = () => { const value = new FormData(); value.set('property', 'sc-domain:frequencylocal.com'); return value }
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.configured = true; m.limited = false; m.propertyAllowed = true; m.attempt = true; m.events = [] })
describe('owner search connection actions', () => {
  it('keeps OAuth starts inside a Server Action, not a side-effectful GET', () => {
    const source = readFileSync('app/(main)/spaces/[slug]/settings/coach/search-actions.ts', 'utf8')
    expect(source.trimStart().startsWith("'use server'")).toBe(true)
    expect(source).not.toContain('export async function GET')
  })
  it('verifies fresh editor, rate and page scope before minting one-use state', async () => {
    await expect(startSearchProvider('space', 'google', form())).rejects.toThrow('REDIRECT:https://accounts.google.com/')
    expect(m.events).toEqual(['authorize', 'rate', 'scope', 'begin'])
    expect(beginSearchConnection).toHaveBeenCalledWith('space', 'google_search_console', 'sc-domain:frequencylocal.com', 'page_urls')
    expect(searchAuthorizationUrl).toHaveBeenCalledWith('google_search_console', 'opaque-state', 'pkce-challenge')
  })
  it.each(['permission', 'configuration', 'rate', 'scope'])('does not mint credentials/state when %s is unavailable', async cause => {
    if (cause === 'permission') m.allowed = false
    if (cause === 'configuration') m.configured = false
    if (cause === 'rate') m.limited = true
    if (cause === 'scope') m.propertyAllowed = false
    try { await startSearchProvider('space', 'google', form()) } catch (error) { expect(String(error)).not.toContain('private-client-secret') }
    expect(beginSearchConnection).not.toHaveBeenCalled()
    expect(searchAuthorizationUrl).not.toHaveBeenCalled()
  })
  it('does not redirect to Google when the store refuses to create a pending generation', async () => {
    m.attempt = false
    await expect(startSearchProvider('space', 'google', form())).rejects.toThrow('/settings/coach?search=unavailable')
    expect(searchAuthorizationUrl).not.toHaveBeenCalled()
  })
  it('denies disconnect to outsiders and delegates authorized forgetting to the guarded store', async () => {
    m.allowed = false
    expect(await disconnectSearchProvider('space', 'google')).toEqual({ success: false })
    expect(disconnectSearchConnection).not.toHaveBeenCalled()
    m.allowed = true
    expect(await disconnectSearchProvider('space', 'google')).toEqual({ success: true })
    expect(disconnectSearchConnection).toHaveBeenCalledWith('space', 'google_search_console')
  })
  it('denies review at the action boundary before any runtime/private read', async () => {
    m.allowed = false
    expect(await reviewConnectedSearch('space', 'google')).toEqual({ status: 'unavailable', reason: 'permission_denied' })
    expect(reviewSearchSignals).not.toHaveBeenCalled()
  })
  it('never bypasses runtime gates or coerces an unknown provider into Google', async () => {
    expect(await reviewConnectedSearch('space', 'unknown')).toMatchObject({ status: 'unavailable', reason: 'invalid_provider' })
    expect(reviewSearchSignals).not.toHaveBeenCalled()
    expect(await reviewConnectedSearch('space', 'google')).toMatchObject({ status: 'unavailable' })
    expect(reviewSearchSignals).toHaveBeenCalledWith('space', 'google_search_console')
  })
})
