// Fails on main: every social link on a personal Spotlight shows the same globe icon.
import { readFileSync } from 'node:fs'
const s = readFileSync('components/spotlight/link-in-bio.tsx', 'utf8')
if (!s.includes('SOCIAL_ICONS')) { console.error('no per-network icons'); process.exit(1) }
if (/s\.kind === 'email' \? <Mail/.test(s)) { console.error('still the email-or-globe ternary'); process.exit(1) }
console.log('ok')
