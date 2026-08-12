// ── MY FREQUENCY — the fixed personal rows, as DATA ───────────────────────────────────
//
// The Spaces and Circles inside the My Frequency disclosure have always been data; the four rows
// above them (Profile, Journal, My Contacts, Drafts) were four hand-written <EntryRow> literals in
// components/layout/my-frequency-menu.tsx. That was survivable while none of them carried a count.
// Drafts does (owner ruling 2026-08-12), and a badge that only exists inside JSX is a badge nothing
// can assert about — which is precisely how /drafts shipped with no entrance at all and no test
// noticed (lib/nav/drafts-entrance.test.ts).
//
// PURE, AND THAT IS THE POINT. No React, no Next, no Supabase: lib/nav/my-frequency.ts holds the
// session client, so a client component may only ever import its TYPES. This module has no such
// problem, so the menu can import it for real and the rows can be tested without rendering.

import type { MyFrequency, MyFrequencyEntry } from './my-frequency'

/**
 * The member's own things, in rail order, above the Spaces and Circles groups.
 *
 * DRAFTS SITS WITH JOURNAL AND MY CONTACTS because DAWN files a member's own content under "You,
 * and what you run" (design_handoff/dawn/guidelines/chrome-docks.card.html), and the 2026-08-06
 * regroup already moved those two here for that reason. It is the ONE row in this group a member
 * comes back FOR rather than to configure, and it is the only one that can be waiting on them.
 *
 * ONE WORD, "Drafts", matching the page's own H1 and metadata title and the canon entry that pins
 * the name to that single surface (docs/NAMING.md "Drafts"). Never "My drafts".
 */
export function personalRows(data: MyFrequency): MyFrequencyEntry[] {
  return [
    { key: 'profile', label: 'Profile', href: data.profileHref, notices: 0 },
    { key: 'journal', label: 'Journal', href: '/journal', notices: 0 },
    { key: 'contacts', label: 'My Contacts', href: '/network/contacts', notices: 0 },
    { key: 'drafts', label: 'Drafts', href: '/drafts', notices: data.drafts },
  ]
}

/**
 * What the count chip prints, or null for no chip at all.
 *
 * ZERO IS NOT A NUMBER TO SHOW. A rail row reading "Drafts 0" is a row telling a member about the
 * absence of something, every page, forever; the whole message of a badge is "there is something",
 * so nothing is the correct rendering of nothing. Non-finite and negative counts fall the same way
 * rather than printing "NaN" out of a fail-safe read that returned junk.
 */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(count)
}
