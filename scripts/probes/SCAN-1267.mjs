// SCAN-1267: the admin member rosters offer an Oldest sort (first signups first) beside Recent.
import { readFileSync } from 'node:fs'

const src = readFileSync('app/(main)/admin/crm/member-summaries.ts', 'utf8')
const block = src.slice(src.indexOf('export const MEMBER_SORT_OPTIONS'))
const end = block.indexOf(']\n')
const options = end > 0 ? block.slice(0, end) : ''
const bad = []
if (!/key: 'recent'[^\n]*key: 'joined', direction: 'desc'/.test(options)) bad.push('the Recent sort (joined, newest first) is missing')
if (!/key: 'oldest', label: 'Oldest'[^\n]*key: 'joined', direction: 'asc'/.test(options)) bad.push('there is no Oldest sort reading the joined date ascending')
if (bad.length) {
  console.error('SCAN-1267: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1267: the admin member rosters sort by signup date both ways (Recent and Oldest)')
