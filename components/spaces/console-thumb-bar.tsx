import Link from 'next/link'
import type { ThumbAction } from '@/lib/spaces/console-thumb'

// THE SPACE CONSOLE'S THUMB BAR (LIVE-704, ADR-1639): the operator's daily doors at the bottom edge of a
// phone, where a thumb holding the phone can reach them. Below md only; at md and up the console's own
// rows are a pointer away and the bar never renders.
//
// SLOT 0c OF THE MOBILE STACKING CONTRACT (components/sidebar/game-stats-dock.tsx), and rule 7 is the
// whole geometry: a full-bleed opaque bar takes the lane as PADDING, never as an offset.
//   bottom:         var(--tab-bar-h)                        its background meets the tab bar, no gap
//   padding-bottom: calc(var(--lane-rise) + 0.5rem)         its controls clear the Zap catch and the
//                                                           chat tab, which ride ON the bar's foot
// At a 17px root on a 390x844 phone with a 34px inset: the tab bar spans [0, 93.5], the lane rises
// 53px above it, so the controls sit on [155, 206] and the bar's top edge near 215. All of that is
// inside the 35dvh reachable band (295px) the contract names.
//
// A FIXED CONTROL TAKES THE COARSE 44 AND NEVER THE PER-GENERATION DIP (the contract's thumb-zone rule):
// the targets are min-h-[44px] and h-12 (51px), not `tap-target`, because `--tap-min` dips to 26px in
// the dense preset and a fixed control has no neighbours to borrow slack from.
//
// THE HOST PADS FOR IT. The shell pads its column by --tab-bar-clearance, which clears the lane and not
// this bar, so the last rows of the page would sit under it. The bar's own height above the lane is
// pt-2 + h-12 + the 0.5rem gutter + the 1px rule, about 69px; the /manage page wrapper carries
// `max-md:pb-18` (76.5px) for it. The pad lives on the page and not in here because the board renders
// mid-page (approvals follow it), and a spacer is only useful at the END of the scroll.
//
// Every label, icon and href comes from a catalog row the console already resolved for this viewer
// (lib/spaces/console-thumb.ts); this file only draws them.
export function ConsoleThumbBar({ actions }: { actions: readonly ThumbAction[] }) {
  if (actions.length === 0) return null
  return (
    <nav
      aria-label="Quick actions"
      data-console-thumb-bar
      className="fixed inset-x-0 bottom-[var(--tab-bar-h)] z-40 border-t border-border bg-surface px-3 pt-2 pb-[calc(var(--lane-rise)+0.5rem)] md:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col gap-1">
        {actions.map(({ module, href }) => {
          const Icon = module.Icon
          return (
            <li key={module.id} className="min-w-0">
              <Link
                href={href}
                className="flex h-12 min-h-[44px] w-full min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-control text-2xs font-semibold text-text outline-none transition-colors active:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                <span className="block max-w-full truncate">{module.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
