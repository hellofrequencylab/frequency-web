'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, UserRound, Building2, Users, NotebookPen, ContactRound } from 'lucide-react'
import type { MyFrequency, MyFrequencyEntry } from '@/lib/nav/my-frequency'
import { personalRows, badgeLabel } from '@/lib/nav/my-frequency-rows'

// ── MY FREQUENCY — the rail's one disclosure ──────────────────────────────────────────
//
// You, and what you run: profile, journal, contacts, the Spaces you run, the Circles you are
// in. DAWN's account dock content (guidelines/chrome-docks.card.html § "You, and what you
// run"), moved to the top of the rail where a member looks first — and removed from the dock,
// because that card's first rule is "a control appears in exactly one dock."
//
// IT DISCLOSES IN PLACE, it does not pop over. The rail is a scroller, so a floating panel has
// to escape it with `position: fixed` and re-anchor on every scroll — DAWN's own AccountDock
// carries that workaround, and it is a workaround. Rows that push their neighbours down need
// none of it, keep one tab order, and survive a fold by reusing the flyout the folded strip
// already has. The rail carries content; content can be nested.
//
// THE BADGE is DAWN's NavRow badge, unchanged: a right-aligned count when the rail is open, a
// 6px dot in the row's top-right corner when it is folded (there is no room for a number, and
// "something is waiting" is the whole message at that width). The parent row wears the TOTAL,
// so a folded rail still says something wants you.
//
// NAMED "menu", NOT "row", and the name is load-bearing. `scripts/check-adoption.mjs` has a
// `bespoke-rows` rule over `*row*.tsx` files that do not compose RowCard — "list rows owed to
// the kit". This is not one: RowCard is the CONTENT-list primitive (MEMBER-DESIGN-SYSTEM §5,
// "dense list rows: offers, your practices, discover"), and a navigation rail has its own row
// grammar, DAWN's NavRow. Calling the file `-row` put it in front of a heuristic aimed at
// something else. It is a menu that occupies one rail row and discloses; the name says that now.
//
// Tokens only. No em dashes in the copy.

const ROW =
  'flex items-center gap-2.5 px-3 py-[0.42rem] rounded-control text-body-sm transition-colors motion-reduce:transition-none'

/** The count chip. Muted at rest, primary when the row it sits on is active — matching the
 *  rail's own two-state colouring so a badge never fights its row. Zero prints NOTHING (the rule
 *  lives in lib/nav/my-frequency-rows badgeLabel, where it can be asserted). */
function Badge({ count, active }: { count: number; active?: boolean }) {
  const label = badgeLabel(count)
  if (!label) return null
  return (
    <span
      className={`ml-auto shrink-0 text-2xs font-bold tabular-nums ${
        active ? 'text-primary-strong' : 'text-muted'
      }`}
    >
      {label}
      <span className="sr-only"> waiting</span>
    </span>
  )
}

/** One nested entry (a Space or a Circle). Indented and hung off a hairline — the SAME
 *  treatment the Admin rail's nested tools use (ADR-848), so the rail has one nesting look. */
function EntryRow({
  entry,
  isActive,
  onNavigate,
}: {
  entry: MyFrequencyEntry
  isActive: (href: string) => boolean
  onNavigate?: () => void
}) {
  const active = isActive(entry.href)
  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      className={`ml-3 border-l border-chrome-border ${ROW} ${
        active ? 'bg-primary-bg text-primary-strong font-extrabold' : 'text-muted font-semibold hover:bg-surface hover:text-text'
      }`}
    >
      <span className="truncate">{entry.label}</span>
      <Badge count={entry.notices} active={active} />
    </Link>
  )
}

/** A labelled run of entries inside the disclosure. Renders nothing when empty, so a member
 *  who runs no Space never sees an empty "Spaces" heading. */
function EntryGroup({
  label,
  Icon,
  entries,
  isActive,
  onNavigate,
}: {
  label: string
  Icon: React.ElementType
  entries: MyFrequencyEntry[]
  isActive: (href: string) => boolean
  onNavigate?: () => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="mt-1.5">
      <p className="flex items-center gap-2 px-3 pb-1 text-2xs font-semibold uppercase tracking-eyebrow text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </p>
      <div className="space-y-0.5">
        {entries.map((e) => (
          <EntryRow key={e.key} entry={e} isActive={isActive} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}

export function MyFrequencyMenu({
  data,
  isActive,
  onNavigate,
  compact = false,
  label = 'My Frequency',
}: {
  data: MyFrequency
  isActive: (href: string) => boolean
  onNavigate?: () => void
  /** The folded icon strip. One square, a dot for the total, and it links straight to the
   *  profile — folding must never make something unreachable, and every entry inside is also
   *  reachable from its own index page and from the palette. */
  compact?: boolean
  /** The row's own name. On the rail it is "My Frequency", which is the surface's name
   *  (ADR-954). Inside the phone drawer's IDENTITY CARD the card above it is already the "you"
   *  half, so the row states the other half of DAWN's law instead: "What you run". Same menu,
   *  same component, one mount per viewport — the label is the only thing that differs. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const anyActive =
    isActive(data.profileHref) ||
    data.spaces.some((s) => isActive(s.href)) ||
    data.circles.some((c) => isActive(c.href))

  if (compact) {
    return (
      <Link
        href={data.profileHref}
        onClick={onNavigate}
        aria-label={data.total > 0 ? `${label}, ${data.total} waiting` : label}
        title={label}
        className={`relative flex h-11 w-11 items-center justify-center rounded-control transition-colors ${
          anyActive ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-chrome-hover hover:text-text'
        }`}
      >
        <UserRound className="h-5 w-5" strokeWidth={anyActive ? 2.5 : 2} />
        {data.total > 0 && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill bg-primary"
            aria-hidden
          />
        )}
      </Link>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // WEIGHT AND COLOUR, NEVER A FILL. When a child row is active the fill belongs to
        // THAT row — DAWN's rail has one amber moment, and painting the parent as well says
        // "you are here" twice about one location. Collapsed, the parent still needs to carry
        // the signal (you cannot see the child), so it takes the active ink and weight alone.
        className={`w-full text-left ${ROW} ${
          anyActive && !open
            ? 'text-primary-strong font-extrabold hover:bg-surface'
            : 'text-muted font-semibold hover:bg-surface hover:text-text'
        }`}
      >
        <UserRound className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <span className="flex-1">{label}</span>
        {!open && <Badge count={data.total} active={anyActive} />}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-[var(--motion-base)] motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {/* Grid-rows disclosure, the same 0fr/1fr technique the account dock uses, so the two
          openings on this rail animate identically — and the same one the phone drawer's Vault
          disclosure uses, which is why the duration is `--motion-base` rather than the 300ms
          literal it used to be. The literal happened to equal ONE generation's value of the
          token; the other four (170 / 210 / 260 / 340ms) it silently opted out of. */}
      <div
        className={`grid transition-[grid-template-rows] duration-[var(--motion-base)] ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-1 pt-0.5">
            {/* Profile · Journal · My Contacts · Drafts. Declared as DATA in
                lib/nav/my-frequency-rows so the rows (and the Drafts count) can be asserted
                without rendering — see lib/nav/drafts-entrance.test.ts. */}
            {personalRows(data).map((entry) => (
              <EntryRow key={entry.key} entry={entry} isActive={isActive} onNavigate={onNavigate} />
            ))}
            <EntryGroup
              label="Spaces"
              Icon={Building2}
              entries={data.spaces}
              isActive={isActive}
              onNavigate={onNavigate}
            />
            <EntryGroup
              label="Circles"
              Icon={Users}
              entries={data.circles}
              isActive={isActive}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-exported so the rail can draw the same glyphs without a second import list.
export const MY_FREQUENCY_ICONS = { UserRound, Building2, Users, NotebookPen, ContactRound }
