// SEC-019: the runbook says what to do when Vercel Cron itself stops.
import { readFileSync } from 'node:fs'
const s = readFileSync('docs/RUNBOOKS.md', 'utf8')
const ok = s.includes('If Vercel Cron itself stops') && s.includes('process-queue') && s.includes('CRON_SECRET')
if (!ok) { console.error('RUNBOOKS.md has no single-scheduler section'); process.exit(1) }
