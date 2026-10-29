// THE LAUNCH INVENTORY (the pure half). Reads the rows an account already has and answers, item by item, "is this
// done, and what did we find". An item is done only when a real record says so, and the found text is the record's own
// value, never ours. Photos are encouraged and skippable, so a missing cover or logo is a photo item that stays on
// the list. Feeds lib/launch/overview.ts. PURE.

import type { LaunchRows } from './done-checks'
import type { InventorySection } from './overview'
import { answersFromLayout } from './spotlight-step'
import { readSpaceSpotlight } from '@/lib/spaces/spotlight'

interface InventoryFacts {
  rows: LaunchRows
  spaceName: string
  coverImageUrl: string | null
  logoUrl: string | null
  /** Photo items the person skipped for now (launch row). They stay on the list. */
  skippedPhotos?: readonly string[]
}

const text = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '')

export function inventorySections(f: InventoryFacts): InventorySection[] {
  const { rows } = f
  const spot = readSpaceSpotlight(rows.preferences)
  const words = text(answersFromLayout(spot.layout).line)
  const tagline = text(rows.tagline)
  const about = text(rows.about)
  const skippedIf = (id: string, url: string | null) => !url && (f.skippedPhotos ?? []).includes(id)
  const prefs = rows.preferences && typeof rows.preferences === 'object' ? (rows.preferences as Record<string, unknown>) : {}
  return [
    {
      id: 'spotlight',
      title: 'Spotlight',
      items: [
        { id: 'sp-live', label: 'A Spotlight is published', state: spot.published ? 'done' : 'todo', found: spot.published ? `${f.spaceName} is live.` : undefined },
        { id: 'sp-words', label: 'Say what you do, in your words', state: words ? 'done' : 'todo', found: words ? `"${words}"` : undefined },
      ],
    },
    {
      id: 'space',
      title: 'Space',
      items: [
        { id: 'sc-name', label: 'Space named', state: text(f.spaceName) ? 'done' : 'todo', found: text(f.spaceName) || undefined },
        { id: 'sc-tag', label: 'Tagline', state: tagline ? 'done' : 'todo', found: tagline ? `"${tagline}"` : undefined },
        { id: 'sc-about', label: 'About', state: about ? 'done' : 'todo', found: about ? 'Found on your Space' : undefined },
        { id: 'sc-cover', label: 'Cover image', state: f.coverImageUrl ? 'done' : 'todo', found: f.coverImageUrl ? 'Found on your Space' : undefined, photo: true, skipped: skippedIf('sc-cover', f.coverImageUrl) },
        { id: 'sc-logo', label: 'Logo', state: f.logoUrl ? 'done' : 'todo', found: f.logoUrl ? 'Found on your Space' : undefined, photo: true, skipped: skippedIf('sc-logo', f.logoUrl) },
      ],
    },
    { id: 'website', title: 'Website', items: [{ id: 'w-site', label: 'A website for your Space', state: prefs.websitePublished === true ? 'done' : 'todo' }] },
    {
      id: 'email',
      title: 'Email',
      items: [{ id: 'e-people', label: 'People to write to', state: rows.contactCount > 0 ? 'done' : 'todo', found: rows.contactCount > 0 ? `${rows.contactCount} in your list` : undefined }],
    },
    {
      id: 'schedule',
      title: 'Schedule',
      items: [{ id: 'c-first', label: 'Put your first event on the calendar', state: rows.eventCount > 0 ? 'done' : 'todo', found: rows.eventCount > 0 ? `${rows.eventCount} on the calendar` : undefined }],
    },
    {
      id: 'circle',
      title: 'Circle',
      items: [{ id: 'ci-first', label: 'Open a Circle for your people', state: rows.circleCount > 0 ? 'done' : 'todo', found: rows.circleCount > 0 ? `${rows.circleCount} open` : undefined }],
    },
    {
      id: 'journey',
      title: 'Journey',
      items: [{ id: 'j-first', label: 'Write your first Journey', state: rows.journeyCount > 0 ? 'done' : 'todo', found: rows.journeyCount > 0 ? `${rows.journeyCount} written` : undefined }],
    },
    {
      id: 'paid',
      title: 'Get paid',
      items: [{ id: 'p-ready', label: 'Be ready to take payments', state: rows.payoutsReady ? 'done' : 'todo', found: rows.payoutsReady ? 'Payouts are on' : undefined }],
    },
  ]
}
