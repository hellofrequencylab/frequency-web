import Link from 'next/link'

// A ranked value→count list for a Tile (ADR-233). The recurring "top pages / top
// features / channels / sources" micro-list — promoted out of the home dashboard so
// the analytics surfaces stop hand-rolling it. Optional per-row `href` drills in.
//
//   <Tile label="Top pages" caption="last 7 days">
//     <RankList items={dash.topPages.slice(0, 5)} />
//   </Tile>

export interface RankItem {
  value: string
  n: number
  href?: string
}

export function RankList({ items, empty = 'No signal yet.' }: { items: RankItem[]; empty?: string }) {
  if (items.length === 0) return <p className="text-xs text-subtle">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {items.map((i) => {
        const row = (
          <>
            <span className="truncate text-muted">{i.value}</span>
            <span className="shrink-0 font-semibold tabular-nums text-text">{i.n.toLocaleString()}</span>
          </>
        )
        return (
          <li key={i.value} className="flex items-baseline justify-between gap-3 text-sm">
            {i.href ? (
              <Link href={i.href} className="flex w-full items-baseline justify-between gap-3 hover:underline">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}
