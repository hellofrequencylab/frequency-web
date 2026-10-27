import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
if (process.env.FREQUENCY_EPHEMERAL_ROOM_STAGING !== '1') throw new Error('Explicit ephemeral staging opt-in required')
// Capture normal CLI status output: it contains locally generated keys. Never print or upload it.
const result = spawnSync('pnpm', ['exec', 'supabase', 'start', '--exclude', 'studio,imgproxy,inbucket,edge-runtime,functions,analytics,vector,meta,storage,realtime'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
const captured = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
fs.writeFileSync('atomic-room-local-start.private.log', captured, { mode: 0o600 })
for (const match of captured.matchAll(/Applying migration ([0-9]{14}_[a-zA-Z0-9_-]+\.sql)/g)) console.log('Applied migration ' + match[1])
if (result.status !== 0) { console.error('Isolated local Supabase startup/fresh migration replay failed; raw local status is withheld because it may contain generated keys.'); process.exitCode = 1 }
else console.log('Fresh isolated Supabase database and API services started; local keys withheld')
