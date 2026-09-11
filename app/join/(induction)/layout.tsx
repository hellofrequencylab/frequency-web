// The Funnels induction runs in light mode, whatever the member's theme is (owner, 2026-08-07).
//
// It is a scripted cinematic sequence — `induction.tsx` describes itself as "centered, warm-light"
// and its art, its reel renders and its inset fields were all drawn against the light canvas. In
// dark mode it is not a second styling of the same flow, it is the flow with its lighting wrong.
//
// ── WHY THIS LAYOUT NO LONGER DOES THE WORK (2026-09-11) ─────────────────────────────────────
//
// It used to carry an inline pre-paint script AND a `ForceLight` component that stripped `.dark` on
// mount and restored the member's real mode on unmount. That was the right shape while nothing else
// re-resolved the mode after first paint. It stopped being right the moment `ThemeModeSync` joined
// the root layout to handle client-side navigation: React runs CHILD effects before PARENT ones, so
// ForceLight stripped the class and ThemeModeSync put it straight back — handing a dark-mode member
// the exact broken lighting the override exists to prevent, on a flow they only see once.
//
// The lock is now a RULE rather than an override. `isLightLockedPath` in lib/theme/mode.ts covers
// these three routes, so the pre-paint bootstrap, the post-paint sync and the toggles all agree by
// construction and there is nothing left here to race. The scoping is unchanged and is still
// deliberate: the sibling `/join/<slug>` routes (Funnel splashes + Circle invite redemption) are
// ordinary surfaces that keep honouring the member's choice.
//
// The member's stored preference is still never written — see the mode law's header for why that
// matters. Leave the funnel and their own mode comes straight back.

export default function FunnelInductionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
