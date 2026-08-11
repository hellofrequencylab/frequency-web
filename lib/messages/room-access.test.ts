import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  canReadRoom,
  canPostToRoom,
  roomPostGateReason,
  type RoomVisibility,
} from './room-access'

// The rule is pure, so it is tested for what it SAYS; the source-shape block at the bottom is
// what keeps the three renderers actually asking it. Both halves matter: a correct rule nobody
// consults is the state this file was written to end.

const NON_CHANNEL: RoomVisibility[] = ['public', 'private', 'circle', 'hub', 'nexus', 'outpost']

describe('canReadRoom', () => {
  it('lets a member read every kind of room', () => {
    for (const visibility of [...NON_CHANNEL, 'channel' as const]) {
      expect(canReadRoom({ visibility, isMember: true })).toBe(true)
    }
  })

  it('shuts a non-member out of every room except a Channel', () => {
    for (const visibility of NON_CHANNEL) {
      expect(canReadRoom({ visibility, isMember: false })).toBe(false)
    }
    // A Channel room is the open square: readable without joining anything.
    expect(canReadRoom({ visibility: 'channel', isMember: false })).toBe(true)
  })
})

describe('canPostToRoom', () => {
  it('asks a non-Channel room for membership, and ignores tune-in', () => {
    for (const visibility of NON_CHANNEL) {
      expect(canPostToRoom({ visibility, isMember: true, isTunedIn: false })).toBe(true)
      expect(canPostToRoom({ visibility, isMember: false, isTunedIn: true })).toBe(false)
    }
  })

  it('asks a Channel room for tune-in, and ignores room membership', () => {
    // The live defect in both directions. A Channel room carries NO room_members rows, so
    // membership can never be the question there.
    expect(canPostToRoom({ visibility: 'channel', isMember: false, isTunedIn: true })).toBe(true)
    expect(canPostToRoom({ visibility: 'channel', isMember: true, isTunedIn: false })).toBe(false)
  })

  it('never promises a post the server would refuse', () => {
    // Reading is strictly wider than posting, never the other way round: an affordance that
    // outruns the gate is the failure this module exists to stop.
    for (const visibility of [...NON_CHANNEL, 'channel' as const]) {
      for (const isMember of [true, false]) {
        for (const isTunedIn of [true, false]) {
          if (canPostToRoom({ visibility, isMember, isTunedIn })) {
            expect(canReadRoom({ visibility, isMember })).toBe(true)
          }
        }
      }
    }
  })
})

describe('roomPostGateReason', () => {
  it('says tune in for a Channel and join for a room (docs/NAMING.md)', () => {
    expect(roomPostGateReason('channel')).toContain('Tune into this Channel')
    for (const visibility of NON_CHANNEL) {
      expect(roomPostGateReason(visibility)).toContain('Join this room')
    }
  })

  it('carries no em dash (docs/CONTENT-VOICE.md)', () => {
    for (const visibility of [...NON_CHANNEL, 'channel' as const]) {
      expect(roomPostGateReason(visibility)).not.toContain('—')
    }
  })
})

// ── Drift guard: the three surfaces ask THIS module, not their own copy ──────────────────────
// Source-shape, for the same reason components/messages/dock-parity.test.ts is: nothing throws
// when a renderer quietly re-derives the rule, and the symptom (a composer that eats messages,
// or one that never appears) is invisible from a unit test of either renderer alone.

const roomPage = readFileSync('app/(main)/messages/r/[roomId]/page.tsx', 'utf8')
const dockLoader = readFileSync('app/(main)/messages/popover-actions.ts', 'utf8')
const roomThread = readFileSync('components/rooms/room-thread.tsx', 'utf8')
const sendAction = readFileSync('app/(main)/messages/rooms/actions.ts', 'utf8')

describe('the files under test are non-trivial (guards a vacuous pass)', () => {
  it('every source read is a real file', () => {
    for (const src of [roomPage, dockLoader, roomThread, sendAction]) {
      expect(src.length).toBeGreaterThan(1000)
    }
  })
})

describe('both renderers derive read/post from the shared rule', () => {
  it('the room page imports it and uses both halves', () => {
    expect(roomPage).toContain("from '@/lib/messages/room-access'")
    expect(roomPage).toContain('canReadRoom(')
    expect(roomPage).toContain('canPostToRoom(')
    // The collapse that caused the silent-swallow bug: posting must not be spelled as reading.
    // Asserted on the JSX the page actually renders, not on the substring anywhere in the file
    // — the comment explaining the old bug quotes it, and prose about a defect is not the
    // defect. (Same lesson dock-parity.test.ts learned about `leaveConversation(`.)
    const thread = roomPage.slice(roomPage.indexOf('<RoomThread'))
    const props = thread.slice(0, thread.indexOf('/>'))
    expect(props).toContain('canPost={canPost}')
    expect(props).not.toContain('canPost={canRead}')
  })

  it('the dock loader imports it and resolves tune-in rather than guessing', () => {
    expect(dockLoader).toContain("from '@/lib/messages/room-access'")
    expect(dockLoader).toContain('canPostToRoom(')
    expect(dockLoader).toContain('topical_channel_memberships')
    // The old rule, which made every Channel room read-only in the dock.
    expect(dockLoader).not.toContain('canPost: !!memberRes.data')
  })

  it('the composer gate copy comes from the rule, not a hardcoded sentence', () => {
    expect(roomThread).toContain("from '@/lib/messages/room-access'")
    expect(roomThread).toContain('roomPostGateReason(visibility)')
    expect(roomThread).not.toContain('Join this room to send messages.')
  })

  it('the server action still re-gates, so none of the above is the authorization', () => {
    const send = sendAction.slice(sendAction.indexOf('export async function sendRoomMessage'))
    const body = send.slice(0, send.indexOf('\nexport '))
    expect(body).toContain('topical_channel_memberships')
    expect(body).toContain('room_members')
    expect(body).toContain('You must join the room before posting')
  })
})
