#!/usr/bin/env node
// LIVE-2394: the Terms and the Community Guidelines make the same report promise the report form makes
// ("as soon as we can", owner ruling 2026-11-19), not the older "within 24 hours".
import { readFileSync } from 'node:fs'

const failures = []
for (const file of ['app/terms/page.tsx', 'app/guidelines/page.tsx', 'components/report-dialog.tsx']) {
  const src = readFileSync(file, 'utf8')
  if (/within 24 hours/.test(src)) failures.push(`${file} still promises a report review within 24 hours`)
  if (!/report\s+as\s+soon\s+as\s+we\s+can/.test(src)) failures.push(`${file} does not say reports are reviewed as soon as we can`)
}
if (failures.length) {
  for (const f of failures) console.error(`FAIL LIVE-2394: ${f}`)
  process.exit(1)
}
console.log('PASS LIVE-2394')
