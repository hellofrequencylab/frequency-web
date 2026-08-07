// The beta induction runs in light mode, whatever the member's theme is (owner, 2026-08-07).
//
// It is a scripted cinematic sequence — `induction.tsx` describes itself as "centered, warm-light"
// and its art, its reel renders and its inset fields were all drawn against the light canvas. In
// dark mode it is not a second styling of the same flow, it is the flow with its lighting wrong.
// This surface is a five-beat funnel someone passes through once, so pinning it is the honest fix
// and much smaller than maintaining a dark treatment of a flow that gets deleted at launch
// (ADR-068 — the whole induction is temporary).
//
// SCOPED TO `/onboarding/beta/*` DELIBERATELY, not to `/onboarding`. The sibling routes
// (`/onboarding`, `/onboarding/vera`) are ordinary product surfaces that should keep honouring the
// member's choice; only the walk-through is pinned. A layout at this segment is the narrowest place
// that covers the flow plus `complete/` and `preview/` without touching them.
//
// TWO HALVES, AND BOTH ARE NEEDED. The inline script below runs before first paint on a full page
// load, which is what stops the dark-mode flash — the root layout's own pre-paint script has
// already put `.dark` on the element by the time this renders, so this one takes it back off in the
// same frame. `ForceLight` then handles the case the script cannot see: a CLIENT-SIDE navigation
// into the funnel, where no inline script re-runs. It also owns the restore on the way out.
//
// The member's stored preference is never written. See force-light.tsx for why that matters.

import { ForceLight, THEME_COLOR_LIGHT } from './force-light'

// Same shape as the root layout's script: synchronous, self-contained, swallowing its own errors so
// a locked-down storage jar can never take the page down with it. The colour is interpolated rather
// than typed in, so the script and the unmount restore can never disagree about what "light" is.
const forceLightScript = `(function(){try{document.documentElement.classList.remove('dark');var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content','${THEME_COLOR_LIGHT}');}}catch(e){}})();`

export default function BetaInductionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* First child, so it runs as early in the stream as this segment can place it. */}
      <script dangerouslySetInnerHTML={{ __html: forceLightScript }} />
      <ForceLight />
      {children}
    </>
  )
}
