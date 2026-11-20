import type { ReactNode } from 'react'
import Link from 'next/link'
import { doorRuns, type DoorStyle } from '@/lib/spotlight/door-style'

// THE OWNER'S LINKS IN THEIR OWN STYLES, ON EVERY THEME (LIVE-2487). A theme's layout keeps drawing its own door card
// and its own button; this only groups the doors by the style the owner picked and draws text links as one centred,
// underlined row. The row wears the theme's colour and type by inheriting them (no colour of its own), so it sits in
// any theme. New World draws its own (components/spotlight/new-world-kit-layouts.tsx).

// Inline, because each theme's own unlayered link reset outranks any layered utility class.
const UNDERLINE = { textDecoration: 'underline', textUnderlineOffset: 4 } as const

interface StyledDoor { href: string; title: string; style?: DoorStyle }

/** Text links: one centred row, underlined in the theme's own text colour. Spans a grid when it sits in one. */
function DoorTextLinks({ doors }: { doors: readonly StyledDoor[] }) {
  return (
    <div className="col-span-full flex flex-wrap justify-center gap-x-5 gap-y-2 py-2 font-bold">
      {doors.map((d) => <Link key={d.href + d.title} href={d.href} style={UNDERLINE}>{d.title}</Link>)}
    </div>
  )
}

/** Every door in order: cards and buttons through the theme's own renderers, text links as one row. */
export function DoorRuns<D extends StyledDoor>({ doors, card, button }: { doors: readonly D[]; card: (d: D, i: number) => ReactNode; button: (d: D, i: number) => ReactNode }) {
  let n = 0
  return (
    <>
      {doorRuns(doors).map((r) => {
        if (r.kind === 'text') return <DoorTextLinks key={`t${n++}`} doors={r.doors} />
        return r.doors.map((d) => { const i = n++; return r.kind === 'button' ? button(d, i) : card(d, i) })
      })}
    </>
  )
}

/** The doors a theme draws as cards (in a grid or a short list), so a text link or a button never takes a card's place. */
export function cardDoors<D extends { style?: DoorStyle }>(doors: readonly D[]): D[] {
  return doors.filter((d) => !d.style || d.style === 'card')
}

/** The owner's text links and buttons a card grid left out, drawn after it in order. Nothing when there are none. */
export function DoorExtras<D extends StyledDoor>({ doors, button }: { doors: readonly D[]; button: (d: D, i: number) => ReactNode }) {
  const extra = doors.filter((d) => d.style === 'text' || d.style === 'button')
  if (!extra.length) return null
  return <DoorRuns doors={extra} card={() => null} button={button} />
}
