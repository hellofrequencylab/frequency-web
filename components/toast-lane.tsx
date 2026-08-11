import type { ReactNode } from 'react'

// ── THE ONE BOTTOM-RIGHT TOAST LANE ──────────────────────────────────────────
//
// WHY THIS EXISTS. AchievementToastContainer and ZapToastContainer each declared their OWN
// `fixed` container, and the two declarations had drifted into being byte-identical:
//
//     fixed bottom-32 md:bottom-24 right-4 z-50 …    (achievement)
//     pointer-events-none fixed bottom-32 right-4 z-50 … md:bottom-24    (zap)
//
// Same lane, same z-index, siblings in app/(main)/layout.tsx — so if both ever had a toast up,
// they would render ON TOP OF EACH OTHER, with DOM order silently deciding which one a member
// could read. Nothing coordinated them because nothing knew the other existed. Today the two
// trigger sets are disjoint (achievements fire only from crew-task completion; zaps from
// check-in, node claim and practice log), so the collision is latent rather than observed — it
// becomes real the first time a zap-awarding action is added to /crew.
//
// Two fixed boxes that must not overlap is not a thing you fix by picking better offsets. It is
// one box. Both stacks are now children of this lane, so they queue in a single column and the
// geometry has exactly one definition.
//
// ── Z-INDEX, and the bug that was actually observed ──────────────────────────
//
// Both lanes sat at z-50. So does the Vera panel (components/vera/vera-launcher.tsx), and it is
// mounted AFTER them in the same stacking context — so with the panel open it painted over every
// toast. On desktop the panel occupies bottom-[4.75rem] right-6, 24rem wide, 600px tall; on
// mobile it is a bottom sheet at 68dvh. Either way the whole toast lane is inside it. Log a
// practice with Vera open and the Zaps you just earned were awarded to a member who never saw it.
//
// The lane sits ABOVE the panel now. A toast is transient, self-dismissing and
// `pointer-events-none`; it does not block the panel it briefly overlaps, and "the feedback for
// the thing you just did" is exactly the content that must not be occluded.
//
// ── THE VERTICAL OFFSETS ─────────────────────────────────────────────────────
//
// EVERY NUMBER HERE IS AT THIS APP'S 17px ROOT (--density-root, app/globals.css), so a `rem`
// class does not render at its Tailwind name: `bottom-32` is 136px, not 128, and `bottom-24` is
// 102px, not 96. The previous version of this block did the arithmetic at 16px — as did the
// mobile half of the contract in components/sidebar/game-stats-dock.tsx — and was 6.25% out
// throughout. Both were corrected in the same pass (DAWN 2026-08-11, Q1).
//
// Mobile — this is SLOT 1 of the mobile stacking contract, which is written out in full in
// components/sidebar/game-stats-dock.tsx. The tab bar owns [0, 93.5] (var(--tab-bar-h) =
// 3.5rem + a 34px home-indicator inset = 59.5 + 34), and the raised Zap catch breaks upward out
// of it to 115.5px. THE CATCH IS WHAT HAS TO BE CLEARED, not the bar: bottom-32 = 136px clears
// it by 20.5px. The chat edge pill is no longer part of this stack at all — it moved to
// top-1/2 of the right edge when the Vault and the chat became one bar.
//
// md and up: the tab bar is gone and the dock bar (components/layout/dock-bar.tsx) sits at
// bottom-0 right-3 occupying [0, 52], so bottom-24 = 102px clears it by 50. Deliberately LOWER
// than mobile, because what has to be cleared is higher on mobile.
//
// Both toast files previously carried an identical comment block asserting "bottom-20 clears it
// by 12px" while the class on the very next line read `md:bottom-24`. The prose was describing a
// value neither file used — corrected here, in the one place the value now lives.
export const TOAST_LANE_CLASS =
  'pointer-events-none fixed bottom-32 right-4 z-[60] flex flex-col items-end gap-3 md:bottom-24 print:hidden'

/**
 * The single fixed column every bottom-right toast renders into. Stacks are plain children, so
 * they cannot overlap and cannot disagree about where the lane is.
 */
export function ToastLane({ children }: { children: ReactNode }) {
  return <div className={TOAST_LANE_CLASS}>{children}</div>
}
