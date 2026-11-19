#!/usr/bin/env node
// Creating a Practice sets its timer, the editor keeps the timer in one section, and the Practice
// page says how the Practice is done.
// Fails while: the create flow sends no timer setup, the setups are not a closed catalog, Vera can
// return anything but IDs, the editor still splits the timer across the form or calls a mode
// "Mindless", the Practice page reads timer columns the ranked view never had, or the autosave
// still drops an edit queued just before another.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const catalog = read('lib/practices/timer-setups.ts')
for (const name of ['timerSetupPatch', 'describeTimer', 'recommendTimerPicks', 'resolveTimerPicks']) {
  if (!new RegExp(`export function ${name}\\(`).test(catalog)) fails.push(`the timer catalog has no ${name}`)
}
if (/from '@\/lib\/(supabase\/[a-z-]+|practices)'/.test(catalog) || /import 'server-only'/.test(catalog)) fails.push('the timer catalog is not client-safe')

const vera = read('lib/ai/practice-timer-suggest.ts')
if (!/enum: TIMER_SETUP_IDS/.test(vera) || !/enum: TIMER_REASON_IDS/.test(vera)) fails.push("Vera's timer tool is not limited to catalog IDs")
if (!/additionalProperties: false/.test(vera)) fails.push("Vera's timer tool accepts extra fields")
if (!/runSpark\(PRACTICE_TIMER/.test(vera) || /completeRaw|completeText|getAnthropic/.test(vera)) fails.push("Vera's timer call bypasses the shared runner")
if (!/'practice-timer':/.test(read('lib/ai/budget.ts'))) fails.push('the timer suggestion has no daily cap')

const action = read('app/(main)/practices/timer-actions.ts')
if (!/recommendTimerPicks\(/.test(action)) fails.push('the suggestion action has no offline answer')
if (/updatePractice|revalidatePath/.test(action)) fails.push('the suggestion action writes')

const spark = read('components/studio/practice/practice-spark.tsx')
if (!/<TimerSuggestions\b/.test(spark) || !/timerSetup:/.test(spark)) fails.push('the create flow does not offer or send a timer setup')
if (!/timerSetupPatch\(setup\.id/.test(read('app/(main)/practices/create-actions.ts'))) fails.push('the create action ignores the picked timer setup')

const builder = read('components/studio/practice/practice-builder.tsx')
const section = read('components/studio/practice/practice-timer-setup.tsx')
if (!/<PracticeTimerSetup\b/.test(builder)) fails.push('the editor has no Timer section')
if (/label="Time \(minutes\)"|Movement mode|Warm-up message/.test(builder)) fails.push('the editor still keeps timer controls outside the Timer section')
if (builder.indexOf('<PracticeTimerSetup') > builder.indexOf('{PRACTICE_SUPPORT_COPY.heading}')) fails.push('the Timer section sits below the supports')
if (/label: 'Mindless'/.test(section) || !/label: 'Be Still'/.test(section)) fails.push('the editor names a timer mode "Mindless"')
if (!/describeTimer\(/.test(section)) fails.push('the editor does not show what members will see')

const page = read('app/(main)/practices/[id]/page.tsx')
if (!/<PracticeTimerPanel\b/.test(page)) fails.push('the Practice page has no timer card')
if (!/describeTimer\(/.test(read('components/practice/practice-timer-panel.tsx'))) fails.push('the timer card does not use the shared description')
const lib = read('lib/practices.ts')
const ranked = lib.slice(lib.indexOf('export async function getRankedPractice'), lib.indexOf('// --- Backlinks'))
if (!/practiceTimerColumns\(p\.id\)/.test(ranked)) fails.push('the Practice page read still lacks the timer columns the ranked view does not expose')

const draft = read('components/studio/kit/use-studio-draft.ts')
if (!/\{ \.\.\.pending\.current, \.\.\.patch \}/.test(draft)) fails.push('the Studio autosave still replaces a queued edit with the next one')

if (fails.length) {
  console.log(`FAIL LIVE-2396\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2396')
