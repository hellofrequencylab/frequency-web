// LIVE-1162: the Space calendar page says what is coming up in words and in structured data.
import { readFileSync } from 'node:fs'

const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')
const seo = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/calendar-seo.tsx', 'utf8')
const problems = []
if (!page.includes('<CalendarSeo')) problems.push('the calendar page does not render CalendarSeo')
if (!page.includes("'text/calendar'")) problems.push('the calendar page does not point at its .ics feed')
if (!seo.includes('eventsListingSchema') || !seo.includes('breadcrumbSchema')) problems.push('no ItemList or breadcrumb markup')
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
