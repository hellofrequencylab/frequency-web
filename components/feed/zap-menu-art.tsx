// Zap menu spot art — the tool tiles + the On Air row in the welcome-art language (flat,
// token-colored, aria-hidden little scenes; never glyphs). Same grammar as
// components/on-air/reveal-art.tsx: rounded wash frame, simple shapes,
// fill-*/stroke-* semantic tokens only.

type Props = { className?: string }

function Frame({ children, wash = 'fill-primary-bg/50' }: { children: React.ReactNode; wash?: string }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" aria-hidden className="h-full w-auto">
      <rect x="4" y="4" width="112" height="72" rx="14" className={wash} />
      {children}
    </svg>
  )
}

// Event — a poster on a wall becoming a calendar day.
export function EventArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame>
        <rect x="22" y="16" width="34" height="46" rx="4" className="fill-surface stroke-primary" strokeWidth="2" />
        <rect x="27" y="22" width="24" height="12" rx="2" className="fill-primary/70" />
        <path d="M28 40h22M28 46h16M28 52h19" className="stroke-signal" strokeWidth="2" strokeLinecap="round" />
        <rect x="66" y="24" width="32" height="32" rx="6" className="fill-surface stroke-primary-strong" strokeWidth="2.5" />
        <path d="M66 33h32" className="stroke-primary-strong" strokeWidth="2.5" />
        <circle cx="82" cy="45" r="5" className="fill-primary" />
      </Frame>
    </span>
  )
}

// Contact — a card with a person, sliding toward you.
export function ContactArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame>
        <rect x="24" y="24" width="58" height="36" rx="6" className="fill-surface stroke-primary" strokeWidth="2.5" />
        <circle cx="40" cy="40" r="7" className="fill-signal" />
        <path d="M33 53a8 8 0 0 1 14 0" className="fill-signal" />
        <path d="M54 36h20M54 44h14" className="stroke-primary-strong" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M88 34l8 6-8 6" className="stroke-primary-strong" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Frame>
    </span>
  )
}

// Partners — a friendly storefront with an offer tag.
export function PartnersArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame wash="fill-signal-bg/50">
        <path d="M30 34h60v26a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4z" className="fill-surface stroke-signal-strong" strokeWidth="2.5" />
        <path d="M26 34l6-12h56l6 12" className="fill-signal/30 stroke-signal-strong" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="40" y="44" width="14" height="20" rx="2" className="fill-signal/50" />
        <rect x="62" y="44" width="20" height="12" rx="2" className="fill-surface stroke-signal" strokeWidth="2" />
        <circle cx="86" cy="28" r="9" className="fill-primary" />
        <path d="M83 28l2.5 2.5L90 25.5" className="stroke-on-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Frame>
    </span>
  )
}

// Event check-in — a doorway, a person stepping through, a check.
export function CheckInArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame>
        <path d="M44 62V22a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v40" className="fill-primary-bg stroke-primary-strong" strokeWidth="2.5" />
        <circle cx="60" cy="38" r="6" className="fill-signal" />
        <path d="M54 50a7 7 0 0 1 12 0v12H54z" className="fill-signal" />
        <path d="M28 62h64" className="stroke-primary-strong" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="86" cy="26" r="9" className="fill-primary" />
        <path d="M82.5 26l2.5 2.5 5-5" className="stroke-on-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Frame>
    </span>
  )
}

// Ghost node — the friendly ghost over a map pin.
export function GhostArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame wash="fill-surface-elevated/80">
        <path
          d="M46 52V36a14 14 0 0 1 28 0v16l-5-4-4.5 4-4.5-4-4.5 4-4.5-4z"
          className="fill-surface stroke-signal"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="54" cy="35" r="2.5" className="fill-signal-strong" />
        <circle cx="66" cy="35" r="2.5" className="fill-signal-strong" />
        <path d="M60 70c-7-6-11-10-11-15a11 11 0 0 1 22 0c0 5-4 9-11 15z" className="fill-primary/30 stroke-primary" strokeWidth="2" />
      </Frame>
    </span>
  )
}

// Mindless — the lotus afloat on quiet water (the On Air timer's door).
export function MindlessArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame>
        <path
          d="M60 14c4.6 5.2 6.8 10 6.8 14.4 0 6-3 10.4-6.8 12.6-3.8-2.2-6.8-6.6-6.8-12.6 0-4.4 2.2-9.2 6.8-14.4Z"
          className="fill-primary/25 stroke-primary-strong"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M57.2 40.2C49.2 39 44.2 33.8 43 25.4c5 .8 9 3 11.8 6.2"
          className="stroke-primary"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M62.8 40.2c8-1.2 13-6.4 14.2-14.8-5 .8-9 3-11.8 6.2"
          className="stroke-primary"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M47 42.5c3.6 3.4 7.9 5.1 13 5.1s9.4-1.7 13-5.1"
          className="stroke-primary-strong"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M28 58c5.3 4 10.7 4 16 0s10.7-4 16 0 10.7 4 16 0 10.7-4 16 0"
          className="stroke-signal"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </Frame>
    </span>
  )
}

// Movement — a figure mid-stride over a track, the Movement timer's door. Flat,
// token-colored, the welcome-art grammar (no glyph): a runner caught between two
// strides on a curving lane, with a small pulse mark for the interval beat.
export function MovementArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame wash="fill-success-bg/50">
        {/* the lane */}
        <path d="M22 60c8-6 18-9 38-9s30 3 38 9" className="stroke-success" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M26 52c7-5 16-7.5 34-7.5S87 47 94 52" className="stroke-success/40" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* the figure mid-stride */}
        <circle cx="58" cy="20" r="6" className="fill-primary-strong" />
        <path
          d="M58 27l-3 12 7 8M55 39l-10 6M62 47l8 7M58 30l9 5"
          className="stroke-primary-strong"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* the interval pulse */}
        <circle cx="86" cy="28" r="8" className="fill-primary/25 stroke-primary" strokeWidth="2" />
        <path d="M82 28h8M86 24v8" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
      </Frame>
    </span>
  )
}

// Connect — your personal code held up between two people meeting.
export function ConnectArt({ className = '' }: Props) {
  return (
    <span className={className}>
      <Frame>
        <rect x="46" y="20" width="28" height="28" rx="5" className="fill-surface stroke-primary-strong" strokeWidth="2.5" />
        {/* a hint of the QR, not a real one */}
        <rect x="52" y="26" width="6" height="6" rx="1" className="fill-primary" />
        <rect x="63" y="26" width="5" height="5" rx="1" className="fill-primary/70" />
        <rect x="52" y="37" width="5" height="5" rx="1" className="fill-primary/70" />
        <rect x="61" y="35" width="7" height="7" rx="1" className="fill-primary" />
        {/* the two people it joins */}
        <circle cx="32" cy="52" r="6" className="fill-signal" />
        <path d="M26 64a7 7 0 0 1 12 0z" className="fill-signal" />
        <circle cx="88" cy="52" r="6" className="fill-primary-strong" />
        <path d="M82 64a7 7 0 0 1 12 0z" className="fill-primary-strong" />
        <path d="M40 56h14M66 56h14" className="stroke-signal" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
      </Frame>
    </span>
  )
}
