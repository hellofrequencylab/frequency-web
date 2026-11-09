// BLD-902: the owner walk-through. The consequence: five owners each built a page from a blank Space and published it
// without help, no control was searched for in ⌘K by more than two of them, and the log is committed at
// docs/builder-walkthrough/sessions.json. Fails until that is true: the verdict is computed by
// lib/builder/walkthrough.ts through scripts/builder-walkthrough.mjs.
import { spawnSync } from 'node:child_process'
const run = spawnSync(process.execPath, ['scripts/builder-walkthrough.mjs'], { encoding: 'utf8' })
if (run.status !== 0) { console.error((run.stdout + run.stderr).trim().slice(0, 1500)); process.exit(1) }
