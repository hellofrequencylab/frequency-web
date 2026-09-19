import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { memberSpaceRewrite } from './member-space-rewrite'

describe('memberSpaceRewrite', () => {
  it('rewrites a signed-in visitor on a Space profile to /full', () => {
    expect(memberSpaceRewrite('/spaces/thursday-lab', true)).toBe('/spaces/thursday-lab/full')
  })

  it('rewrites a signed-in visitor on a Show page to /full/podcasts/<show>', () => {
    expect(memberSpaceRewrite('/spaces/thursday-lab/podcasts/morning', true)).toBe(
      '/spaces/thursday-lab/full/podcasts/morning',
    )
  })

  it('leaves a signed-out visitor on the ISR path', () => {
    expect(memberSpaceRewrite('/spaces/thursday-lab', false)).toBeNull()
    expect(memberSpaceRewrite('/spaces/thursday-lab/podcasts/morning', false)).toBeNull()
  })

  it('does not swallow create, directory, operating, invite, claim, or full', () => {
    for (const slug of ['new', 'directory', 'operating', 'invite', 'claim', 'full']) {
      expect(memberSpaceRewrite(`/spaces/${slug}`, true), slug).toBeNull()
    }
  })

  it('does not rewrite the index, owner surfaces, or an already-rewritten path', () => {
    expect(memberSpaceRewrite('/spaces', true)).toBeNull()
    expect(memberSpaceRewrite('/spaces/thursday-lab/manage', true)).toBeNull()
    expect(memberSpaceRewrite('/spaces/thursday-lab/full', true)).toBeNull()
    expect(memberSpaceRewrite('/spaces/thursday-lab/podcasts', true)).toBeNull()
    expect(memberSpaceRewrite('/spaces/thursday-lab/full/podcasts/morning', true)).toBeNull()
    expect(memberSpaceRewrite('/spaces/thursday-lab/settings', true)).toBeNull()
  })

  it('proxy.ts actually calls this helper', () => {
    const proxy = readFileSync('proxy.ts', 'utf8')
    expect(proxy).toMatch(/\bmemberSpaceRewrite\(/)
    expect(proxy).not.toMatch(/function memberSpaceRewrite\b/)
  })
})
