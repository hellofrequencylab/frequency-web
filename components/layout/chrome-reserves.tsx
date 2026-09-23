// THE SHELL'S RESERVED BOXES — the Suspense fallbacks for chrome that streams.
//
// 🔴 WHY A NULL FALLBACK IS NOT A NEUTRAL CHOICE. `test/e2e/surfaces.ts` recorded this after
// `/feed` failed three capture runs at 8497 → 9272 → 9390px with no code between them: "the page
// carries five `<Suspense fallback={null}>` boundaries and `/settings` carries twelve. A null
// fallback reserves ZERO height, so every boundary that resolves does not swap a placeholder for
// content — it APPENDS." And on why nothing else fixes it: "Masking cannot fix this and neither
// can a longer networkidle. A mask paints over a region; the element keeps its box, so a masked
// block that arrives late still moves everything under it. The failure is the page's HEIGHT, not
// its pixels."
//
// A member reads that height change as chrome that disappears and comes back, which is the
// difference between a load and a blink. So every streamed boundary in the VISIBLE CHROME reserves
// the box its content will occupy. Two exceptions, both judged rather than overlooked:
//   · content that is genuinely out of flow — the Vault dock renders inside DockBar, which is
//     `fixed bottom-0 right-3`, so there is no height to reserve and nothing to push;
//   · content that legitimately resolves to NOTHING — a rail panel that self-hides, where a
//     reserved box would be painted and then deleted, which reads as a broken load
//     (components/sidebar/right-sidebar.tsx states this rule for ControlCenterPanel).
//
// This module imports nothing. It is reachable from `app/(main)/layout.tsx`, so it is multiplied by
// every route beneath it (AGENTS.md, deploy safety) — keep it that way.

/** The dispatch ticker's box: `h-10` + `border-b`, the same two classes the bar itself paints with
 *  in components/layout/dispatch-ticker.tsx. components/layout/chrome-reserves.test.tsx asserts the
 *  two stay equal, so changing the bar's height without changing this one is a red test rather than
 *  a silent 40px jump at the top of every page. Empty, with no shimmer: this is a reservation, not
 *  a promise — the slot renders nothing for a member with no dispatches. */
export function DispatchTickerReserve() {
  return <div aria-hidden data-chrome-reserve="dispatch-ticker" className="h-10 shrink-0 border-b border-border" />
}

/** The mobile Vault's box — the fallback for MobileGameStats, which always renders GameStatsPanel
 *  and therefore always replaces this rather than deleting it. Mirrors that panel's `space-y-4`
 *  stack: the three standing tiles, the season-standing row, the today's-move block. Not pixel-exact
 *  for every member (the arc line and the streak copy vary) and it does not need to be: the drawer
 *  mounts it inside `max-h-[50dvh] overflow-y-auto` (components/layout/app-shell.tsx), so a residual
 *  difference scrolls inside that box instead of moving the page. What matters is that it is not zero. */
export function MobileGameStatsReserve() {
  return (
    <div aria-hidden data-chrome-reserve="mobile-game-stats" className="space-y-4">
      <div className="h-16 rounded-card bg-surface-elevated" />
      <div className="h-9 border-b border-border" />
      <div className="h-20 rounded-card bg-surface-elevated" />
    </div>
  )
}
