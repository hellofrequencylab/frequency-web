// SCAN-1201: the Reviews block renders nothing, not a "coming soon" card, when no rating is set.
import { readFileSync } from 'node:fs'
const src = readFileSync('components/widgets/space-profile/reviews.tsx', 'utf8')
if (/coming soon|on the way/i.test(src.replace(/\/\/.*$/gm, ''))) { console.error('FAIL: reviews block still renders a coming-soon card'); process.exit(1) }
console.log('ok')
