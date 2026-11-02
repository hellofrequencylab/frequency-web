// SCAN-1191: Free Human "upcoming" compares stored wall-clock dates with the Space's own day, never the UTC day.
import { readFileSync } from 'node:fs'
const s = readFileSync('lib/sites/free-human-events.ts', 'utf8')
if (/const today = now\.toISOString\(\)/.test(s) || !/export function freeHumanToday/.test(s)) { console.error('FAIL: UTC day still used for today'); process.exit(1) }
console.log('ok')
