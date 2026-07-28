// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { findA11yViolations, formatViolations } from './axe'

import { DockThreadDetails } from '@/components/messages/dock-thread-details'

// The details layer is a NEW interactive surface inside the chat dock, and it is the surface
// that has to carry rename, leave and the roster once the DM route retires. It is rendered
// here with injected no-op callbacks — which is the reason the component takes callbacks
// rather than importing the server actions: a 'use server' import would drag
// @/lib/supabase/admin into this test and the render would never run.
//
// See test/a11y/axe.ts for what jsdom + axe can and cannot check. Structure yes (labels,
// accessible names, ARIA validity); colour contrast is a separate visual concern.

const noop = async () => null

const participants = [
  { id: 'me', display_name: 'Me Myself', handle: 'me', avatar_url: null },
  { id: 'a', display_name: 'Ada Lovelace', handle: 'ada', avatar_url: null },
  { id: 'b', display_name: 'Ben Stone', handle: 'ben', avatar_url: null },
]

const cases: Array<{ name: string; ui: React.ReactElement }> = [
  {
    name: 'group thread (rename + roster + leave)',
    ui: (
      <DockThreadDetails
        onClose={() => {}}
        name="Sunday crew"
        participants={participants}
        myProfileId="me"
        canRename
        canLeave
        onRename={noop}
        onLeave={noop}
      />
    ),
  },
  {
    name: 'group thread with no stored name',
    ui: (
      <DockThreadDetails
        onClose={() => {}}
        name={null}
        participants={participants}
        myProfileId="me"
        canRename
        canLeave
        onRename={noop}
        onLeave={noop}
      />
    ),
  },
  {
    name: '1:1 thread (roster only, gates mirrored from the page)',
    ui: (
      <DockThreadDetails
        onClose={() => {}}
        name={null}
        participants={participants.slice(0, 2)}
        myProfileId="me"
        canRename={false}
        canLeave={false}
        onRename={noop}
        onLeave={noop}
      />
    ),
  },
]

describe('dock conversation details — a11y (axe)', () => {
  for (const c of cases) {
    it(`${c.name} has no axe violations`, async () => {
      const violations = await findA11yViolations(c.ui)
      expect(violations, `\n${formatViolations(violations)}\n`).toEqual([])
    })
  }
})
