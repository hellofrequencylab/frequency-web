#!/usr/bin/env node
// LIVE-377: eventInstant must not read naive ISO as the machine zone.
import { spawnSync } from 'node:child_process'

const r = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    'lib/events/guest-seat-claim.test.ts',
    'lib/time/zone.test.ts',
    '--reporter=dot',
  ],
  {
    env: { ...process.env, TZ: 'America/Los_Angeles' },
    stdio: 'inherit',
  },
)

process.exit(r.status === null ? 1 : r.status)
