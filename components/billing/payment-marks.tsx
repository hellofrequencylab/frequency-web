// The accepted-payment row that sits UNDER a checkout trigger (LIVE-366).
//
// Its job is one sentence a buyer reads without reading: "a card works here". It stands between
// the button and whatever follows, so pressing the button pushes it down rather than replacing it.
//
// 🔴 MONOCHROME, `currentColor`, NO BRAND PALETTE. Three reasons, in order of weight:
//   1. This app has light, dark, Midnight and a light-lock. A row of full-colour brand tiles is
//      the one element on the card that cannot follow the theme.
//   2. Brand colours here would be raw hex in member-facing UI, which `check:tokens` refuses and
//      which the owner's "make it minimal" brief refuses first.
//   3. A colour tile reads as an advertisement. A grey mark reads as a fact.
//
// The wordmarks are SVG `<text>` with `textLength` + `lengthAdjust`, so each glyph run is scaled to
// fill its own viewBox exactly. That is what makes them immune to the page font: whatever face
// renders, the mark occupies the same box. Sized by `viewBox` rather than a font-size class, so the
// no-literal-type-size rule is not in play at all.

import { CreditCard } from 'lucide-react'

/** One wordmark, stretched to fill its box whatever font the page is using. */
function Wordmark({ label, width }: { label: string; width: number }) {
  return (
    <svg viewBox={`0 0 ${width} 12`} className="h-2.5 w-auto" role="presentation" focusable="false">
      <text
        x="0"
        y="10"
        textLength={width}
        lengthAdjust="spacingAndGlyphs"
        fontSize="12"
        fontWeight="800"
        fill="currentColor"
      >
        {label}
      </text>
    </svg>
  )
}

/** The two interlocking circles. The one card mark that is a shape rather than a word. */
function Circles() {
  return (
    <svg viewBox="0 0 22 12" className="h-2.5 w-auto" role="presentation" focusable="false">
      <circle cx="8" cy="6" r="5.4" fill="currentColor" opacity="0.45" />
      <circle cx="14" cy="6" r="5.4" fill="currentColor" opacity="0.8" />
    </svg>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-md border border-border bg-surface px-1.5 text-subtle">
      {children}
    </span>
  )
}

/**
 * Accepted payment methods, stated quietly.
 *
 * ONE accessible name for the whole row, on the row. The marks themselves are `presentation`,
 * because a screen reader reading "Visa, image, Mastercard, image" four times is noise where one
 * sentence is the content.
 */
export default function PaymentMarks({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      role="img"
      aria-label="Visa, Mastercard, American Express and more accepted"
    >
      <Chip>
        <Wordmark label="VISA" width={26} />
      </Chip>
      <Chip>
        <Circles />
      </Chip>
      <Chip>
        <Wordmark label="AMEX" width={28} />
      </Chip>
      <Chip>
        {/* The generic card, standing in for everything the Payment Element will actually offer
            this buyer: Discover, Link, and whichever wallet their device carries. Naming a wallet
            here would be a promise the browser decides, not us. */}
        <CreditCard className="h-3 w-3" aria-hidden />
      </Chip>
      {/* `text-muted`, not the subtler token: `text-subtle` at this size is sub-AA by construction
          (Lift 3, scripts/check-adoption.mjs `subtle-tiny-type`), and the one word here that is
          words rather than a mark is the one a low-vision reader actually has to read. */}
      <span className="text-2xs text-muted">and more</span>
    </div>
  )
}
