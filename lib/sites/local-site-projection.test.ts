import { describe, expect, it, vi } from 'vitest'
import type { Space } from '@/lib/spaces/types'
import { isLocalSiteProjection, localProjectionDocuments, localProjectionHash, projectLocalSiteSpace } from './local-site-projection'

const env = { VERCEL_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', LOCAL_SITE_CONTENT_PROJECTION: '/local/review.json' }
const fixture = () => ({ id: 'db42cbea-3229-9813-e691-cb0e05272808', slug: 'the-group', preferences: { websitePublished: true, privateSetting: 'untouched', pageDocs: { home: { content: [{ type: 'NetworkCircles', props: { circles: [{ title: 'Coaches Club' }] } }] } }, websiteEditor: { published: { theme: 'Network', pages: [] }, draft: { privateDraft: 'untouched' } } } })
const space = () => fixture() as unknown as Space
const preferences = (s: Space) => s.preferences as ReturnType<typeof fixture>['preferences']
const operation = { op: 'add', path: '/preferences/pageDocs/home/content/0/props/circles/0/circleSlug', title: 'Coaches Club', value: 'tg-coaches-club' }
function manifest(s: Space, operations: unknown[] = [operation]) {
  return { spaceId: s.id, slug: s.slug, applied: false, expectedBaseHash: localProjectionHash(localProjectionDocuments(s.preferences)), expectedOperationsHash: localProjectionHash(operations), operations }
}

describe('explicit local public-site document projection', () => {
  it.each([
    { ...env, VERCEL_ENV: 'production' },
    { ...env, VERCEL_ENV: 'preview' },
    { ...env, VERCEL_ENV: undefined },
    { ...env, NEXT_PUBLIC_SITE_URL: 'https://frequencylocal.com' },
    { ...env, NEXT_PUBLIC_SITE_URL: 'http://localhost.evil.example' },
    { ...env, NEXT_PUBLIC_SITE_URL: 'http://localhost@evil.example' },
    { ...env, NEXT_PUBLIC_SITE_URL: undefined },
    { ...env, LOCAL_SITE_CONTENT_PROJECTION: undefined },
  ])('never reads a file or changes a Space when any local gate is absent: %j', async (runtime) => {
    const s = space()
    const readFile = vi.fn()
    expect(await projectLocalSiteSpace(s, { env: runtime, readFile })).toBe(s)
    expect(readFile).not.toHaveBeenCalled()
    expect(isLocalSiteProjection(s)).toBe(false)
  })

  it('changes only the reviewed public field, without mutating the cached Space, draft or publish gate', async () => {
    const s = space()
    const original = structuredClone(s)
    const result = await projectLocalSiteSpace(s, { env, readFile: async () => JSON.stringify(manifest(s)) })
    expect(preferences(result!).pageDocs.home.content[0].props.circles[0]).toMatchObject({ circleSlug: 'tg-coaches-club' })
    expect(s).toEqual(original)
    expect(preferences(result!).websiteEditor.draft).toEqual(preferences(s).websiteEditor.draft)
    expect(preferences(result!).websitePublished).toBe(true)
    expect(isLocalSiteProjection(result!)).toBe(true)
    expect(isLocalSiteProjection(s)).toBe(false)
  })

  it('never reads or projects another Space, including a similarly named one', async () => {
    const s = { ...space(), id: 'another-space' }
    const readFile = vi.fn()
    expect(await projectLocalSiteSpace(s, { env, readFile })).toBe(s)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('refuses current document drift and changed reviewed operations', async () => {
    const s = space()
    const reviewed = manifest(s)
    const changed = structuredClone(s)
    ;preferences(changed).pageDocs.home.content[0].props.circles[0].title = 'Owner edited this'
    await expect(projectLocalSiteSpace(changed, { env, readFile: async () => JSON.stringify(reviewed) })).rejects.toThrow('documents drifted')
    reviewed.operations[0] = { ...operation, value: 'different-circle' }
    await expect(projectLocalSiteSpace(s, { env, readFile: async () => JSON.stringify(reviewed) })).rejects.toThrow('operations changed')
  })

  it.each(['/preferences/websitePublished', '/preferences/websiteEditor/draft/privateDraft', '/preferences/__proto__/polluted'])('refuses an unreviewed/private field even with matching hashes: %s', async (path) => {
    const s = space()
    await expect(projectLocalSiteSpace(s, { env, readFile: async () => JSON.stringify(manifest(s, [{ op: 'replace', path, value: 'unsafe' }])) })).rejects.toThrow('only reviewed public')
  })

  it('refuses stale replacement values and mismatched authored identities', async () => {
    const s = space()
    await expect(projectLocalSiteSpace(s, { env, readFile: async () => JSON.stringify(manifest(s, [{ ...operation, title: 'Wrong circle' }])) })).rejects.toThrow('invalid circle mapping')
    await expect(projectLocalSiteSpace(s, { env, readFile: async () => JSON.stringify(manifest(s, [{ ...operation, op: 'replace', before: 'stale' }])) })).rejects.toThrow('authored value changed')
  })
})
