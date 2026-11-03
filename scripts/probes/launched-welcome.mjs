// LIVE-2064: the launched welcome exists and fires on completion. Reads the files, never a test runner (LIVE-034): the
// sender claims the log row before it enqueues, the launch page calls it once completeLaunch has landed, and the words
// carry no em dash and no hard claim. Exit 1 on the first miss.
import { readFileSync, existsSync } from 'node:fs'
const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const io = read('lib/launch/launched-io.ts')
if (!io) bad.push('lib/launch/launched-io.ts is missing')
const claimAt = io.indexOf("from('launch_email_log').insert(")
const sendAt = io.indexOf('enqueueEmail(')
if (claimAt < 0 || sendAt < 0 || claimAt > sendAt) bad.push('the welcome does not claim its log row before it sends')
if (!/resolveSendGate\(launch\.ownerId, 'email', 'lifecycle'/.test(io)) bad.push('the welcome skips the lifecycle send gate')

const page = read('app/(main)/launch/page.tsx')
if (!/\(await completeLaunch\(launch\)\)\) \{\s*\/\/[^\n]*\n\s*await sendLaunchedWelcome\(launch/.test(page)) bad.push('the launch page does not send the welcome once the launch completes')

const words = read('lib/launch/launched-email.ts')
if (/—/.test(words)) bad.push('the welcome carries an em dash')
if (/guarantee|every week|weekly/i.test(words)) bad.push('the welcome makes a hard claim or a weekly promise')
if (!/'launched_welcome'/.test(words)) bad.push('the welcome kind is not launched_welcome')

if (bad.length) { for (const b of bad) console.error('✗', b); process.exit(1) }
console.log('✓ launched welcome: gated, claimed, then sent once the launch completes')
