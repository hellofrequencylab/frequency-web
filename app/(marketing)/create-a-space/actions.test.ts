import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, serializeDraft } from '@/lib/create-space/builder'

// The hand-over actions through the real file. The doubles are the edges only: the two sign-in actions it reuses, the
// session, the hold's cookie write, the Spaces read and the launch switch.

let profileId: string | null = null
let launchOpen = true
let taken: boolean | null | 'throws' = false
let sendResult: { ok: true } | { ok: false; error: string } = { ok: true }
const sent: Record<string, string>[] = []
const googled: Record<string, string>[] = []
const held: unknown[] = []

class Redirected extends Error {
  constructor(public to: string) {
    super(to)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))
vi.mock('@/app/sign-in/actions', () => ({
  sendSignupLink: async (fd: FormData) => {
    sent.push(Object.fromEntries(fd) as Record<string, string>)
    return sendResult
  },
  signInWithGoogle: async (fd: FormData) => {
    googled.push(Object.fromEntries(fd) as Record<string, string>)
  },
}))
vi.mock('@/lib/launch/enabled', () => ({ launchSystemEnabled: () => launchOpen }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => profileId }))
vi.mock('@/lib/launch/pending-io', () => ({
  writePendingLaunch: async (hold: unknown) => {
    held.push(hold)
  },
}))
vi.mock('@/lib/spaces/store', () => ({
  isSpaceSlugTaken: async () => {
    if (taken === 'throws') throw new Error('db down')
    return taken
  },
}))

import { claimWithEmail, claimWithGoogle, continueSignedIn } from './actions'

const draft = (over: Record<string, unknown> = {}) =>
  serializeDraft({ ...emptyDraft('designer', true), name: 'Saltwater Collective', slug: '', goals: ['events'], hostName: 'Sam Rivera', done: { name: true, look: true, goals: true, host: true }, ...over })

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  profileId = null
  taken = false
  launchOpen = true
  sendResult = { ok: true }
  sent.length = 0
  googled.length = 0
  held.length = 0
})

describe('the magic link', () => {
  it('holds the draft for the launch, then sends the existing signup link to the launch claim', async () => {
    const res = await claimWithEmail(form({ email: ' sam@example.com ', draft: draft() }))
    expect(res).toEqual({ ok: true, email: 'sam@example.com', keepBuildingHref: '/launch/step/spotlight' })
    expect(sent).toEqual([{ email: 'sam@example.com', next: '/launch/claim' }])
    expect(held).toHaveLength(1)
    expect(held[0]).toMatchObject({ intents: ['events'], answers: { spotlight: { name: 'Saltwater Collective', handle: 'saltwatercollective', theme: 'designer', host: 'Sam Rivera' } } })
  })

  it('sends sign-in to the Create a Space form, with no keep-building link, while the launch is off', async () => {
    launchOpen = false
    const res = await claimWithEmail(form({ email: 'sam@example.com', draft: draft() }))
    expect(res).toEqual({ ok: true, email: 'sam@example.com', keepBuildingHref: null })
    expect(sent).toEqual([{ email: 'sam@example.com', next: '/spaces/new' }])
  })

  it('sends Google and a signed-in member to the same safe place while the launch is off', async () => {
    launchOpen = false
    await claimWithGoogle(form({ draft: draft() }))
    expect(googled).toEqual([{ next: '/spaces/new' }])
    profileId = 'p-1'
    expect(await continueSignedIn(form({ draft: draft() }))).toEqual({ ok: true, href: '/spaces/new' })
  })

  it('stops at a bad address without sending or holding anything', async () => {
    for (const email of ['', 'nope', 'a@b', 'x'.repeat(250) + '@b.co']) {
      expect(await claimWithEmail(form({ email, draft: draft() }))).toEqual({ ok: false, error: 'Enter a full email address.' })
    }
    expect(sent).toEqual([])
    expect(held).toEqual([])
  })

  it('stops at a draft that is not enough', async () => {
    for (const bad of [draft({ name: '' }), draft({ slug: '-x' }), 'junk']) {
      const res = await claimWithEmail(form({ email: 'sam@example.com', draft: bad }))
      expect(res.ok).toBe(false)
    }
    expect(sent).toEqual([])
    expect(held).toEqual([])
  })

  it('stops when the handle was taken since the page last asked, but not when the read fails', async () => {
    taken = true
    const stopped = await claimWithEmail(form({ email: 'sam@example.com', draft: draft() }))
    expect(stopped).toEqual({ ok: false, error: 'That handle was just taken. Pick another and try again.' })
    expect(sent).toEqual([])
    taken = null
    expect((await claimWithEmail(form({ email: 'sam@example.com', draft: draft() }))).ok).toBe(true)
    taken = 'throws'
    expect((await claimWithEmail(form({ email: 'sam@example.com', draft: draft() }))).ok).toBe(true)
  })

  it('passes on the sign-in action\'s own line when the send fails', async () => {
    sendResult = { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
    expect(await claimWithEmail(form({ email: 'sam@example.com', draft: draft() }))).toEqual({ ok: false, error: sendResult.error })
  })
})

describe('Google', () => {
  it('holds the draft and hands the launch claim to the existing Google sign-in', async () => {
    await claimWithGoogle(form({ draft: draft() }))
    expect(googled).toEqual([{ next: '/launch/claim' }])
    expect(held).toHaveLength(1)
  })

  it('sends a bad draft back to the builder without going to Google', async () => {
    await expect(claimWithGoogle(form({ draft: 'junk' }))).rejects.toMatchObject({ to: '/create-a-space#get-started' })
    expect(googled).toEqual([])
    expect(held).toEqual([])
  })
})

describe('a member who is already signed in', () => {
  it('skips the account and gets the launch claim', async () => {
    profileId = 'p-1'
    expect(await continueSignedIn(form({ draft: draft() }))).toEqual({ ok: true, href: '/launch/claim' })
    expect(held).toHaveLength(1)
    expect(sent).toEqual([])
  })

  it('is refused, with nothing held, when there is no session', async () => {
    const res = await continueSignedIn(form({ draft: draft() }))
    expect(res.ok).toBe(false)
    expect(held).toEqual([])
  })
})
