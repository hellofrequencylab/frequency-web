'use client'

// The seam that keeps Stripe out of everyone else's bundle (LIVE-347, generalised in LIVE-359).
//
// Entity-blind on purpose: it takes a client secret, a price label and a fallback, so every one of
// the nine checkout creators mounts THIS, rather than each growing its own card form.
//
// 🔴 WHY THIS FILE EXISTS AT ALL. `dynamic(..., { ssr: false })` is NOT allowed in a Server
// Component in this version of Next — node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md
// §"Skipping SSR": "ssr: false is not allowed with next/dynamic in Server Components. Please move
// it into a Client Component." This is that Client Component. Same shape, and the same reason, as
// components/maps/map-canvas.tsx.
//
// ⚠️ AND SSR MUST BE SKIPPED. A 'use client' module still EXECUTES ON THE SERVER during render
// (server-and-client-boundary.md: Client Components run in both places). Stripe.js touches
// `window`, so the form has to be excluded from the server pass rather than merely marked client.
//
// The split is what keeps this cheap: everything Stripe is reached only through the `import()`
// below, so it lands in its own chunk. A visitor who reads an event page and never clicks buy
// downloads none of it. `import()` is invisible to the static-import walk in
// scripts/check-shell-weight.mjs for exactly that reason — that is the point of the split, not a
// way around the gate.
//
// 🔴 'use client' IS ON LINE 1 ON PURPOSE. scripts/check-client-server-boundary.mjs detects a
// client entry with /^\s*['"]use client['"]/ — whitespace only, no comment skipping — while
// scripts/check-shell-weight.mjs skips leading banners. Putting the directive below this comment
// would make the two gates disagree about what this file is.
import dynamic from 'next/dynamic'

const CheckoutForm = dynamic(() => import('./checkout-form'), { ssr: false })

export default function CheckoutPanel({
  clientSecret,
  priceLabel,
  onFellBack,
}: {
  clientSecret: string
  priceLabel: string
  onFellBack: () => void
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <CheckoutForm
        clientSecret={clientSecret}
        priceLabel={priceLabel}
        onFellBack={onFellBack}
      />
    </div>
  )
}
