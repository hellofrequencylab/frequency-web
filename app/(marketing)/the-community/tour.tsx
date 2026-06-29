'use client'

import { useId, useState } from 'react'
import {
  Heart,
  MessageCircle,
  Zap,
  Users,
  CalendarDays,
  MapPin,
  Sparkles,
  Repeat,
} from 'lucide-react'
import { RoleBadge } from '@/lib/community-roles'

// ── Interactive product tour ──────────────────────────────────────────────────
// RSC pages can't hold state, so the tabbed walkthrough lives here as a client
// island. Four steps, each swapping a faux-UI panel built entirely from design
// tokens (no raw hex, crisp in light + dark). Real <button>s + ARIA tab pattern
// so it's keyboard- and screen-reader-friendly.

type StepKey = 'feed' | 'circles' | 'events' | 'zaps'

const STEPS: {
  key: StepKey
  label: string
  icon: typeof Heart
  benefit: string
}[] = [
  {
    key: 'feed',
    label: 'Feed',
    icon: MessageCircle,
    benefit: 'The pulse of your people: small, real, and missed when you go quiet.',
  },
  {
    key: 'circles',
    label: 'Circles',
    icon: Users,
    benefit: 'A handful of people near you, built around what you practice.',
  },
  {
    key: 'events',
    label: 'Events',
    icon: CalendarDays,
    benefit: 'The standing times to actually show up, in the flesh.',
  },
  {
    key: 'zaps',
    label: 'Zaps',
    icon: Zap,
    benefit: 'Gratitude you can give: recognition rises from showing up, not titles.',
  },
]

export function ProductTour() {
  const [active, setActive] = useState<StepKey>('feed')
  const baseId = useId()
  const activeStep = STEPS.find((s) => s.key === active) ?? STEPS[0]

  // Standard ARIA tabs keyboard pattern: arrows move + select between tabs,
  // Home/End jump to the ends. Pairs with the roving tabIndex below.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = STEPS.findIndex((s) => s.key === active)
    let next = i
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % STEPS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + STEPS.length) % STEPS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = STEPS.length - 1
    else return
    e.preventDefault()
    setActive(STEPS[next].key)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Take a tour of the Frequency app"
        onKeyDown={onKeyDown}
        className="flex flex-wrap justify-center gap-2 sm:gap-3"
      >
        {STEPS.map((step) => {
          const Icon = step.icon
          const selected = step.key === active
          return (
            <button
              key={step.key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${step.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${step.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(step.key)}
              className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors ${
                selected
                  ? 'bg-primary text-on-primary'
                  : 'border border-border text-muted hover:border-border-strong hover:text-text'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {step.label}
            </button>
          )
        })}
      </div>

      {/* Benefit caption */}
      <p
        className="mt-7 text-center text-xl italic text-muted max-w-2xl mx-auto"
        aria-live="polite"
      >
        {activeStep.benefit}
      </p>

      {/* Panels — each wrapped in a phone-style frame */}
      <div className="mt-9 flex justify-center">
        {STEPS.map((step) => (
          <div
            key={step.key}
            role="tabpanel"
            id={`${baseId}-panel-${step.key}`}
            aria-labelledby={`${baseId}-tab-${step.key}`}
            hidden={step.key !== active}
            className="w-full"
          >
            {step.key === active && <PhoneFrame>{panelFor(step.key)}</PhoneFrame>}
          </div>
        ))}
      </div>
    </div>
  )
}

function panelFor(key: StepKey) {
  switch (key) {
    case 'feed':
      return <FeedPanel />
    case 'circles':
      return <CirclesPanel />
    case 'events':
      return <EventsPanel />
    case 'zaps':
      return <ZapsPanel />
  }
}

// ── Phone-style frame ─────────────────────────────────────────────────────────
// A tasteful device shell so the mock UI reads as "the app". Token-only.

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded-[2.5rem] border border-border-strong bg-surface-elevated p-2.5 shadow-pop-lg">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-canvas">
          {/* Status / app bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 bg-surface border-b border-border">
            <span className="font-display uppercase text-lg text-text leading-none">
              Frequency
            </span>
            <span className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-primary-strong">
              <MapPin className="w-3 h-3" aria-hidden />
              North County
            </span>
          </div>
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── Faux-UI panels ────────────────────────────────────────────────────────────

function Avatar({ initials, role }: { initials: string; role: 'jade' | 'teal' | 'stone' }) {
  const tint =
    role === 'jade'
      ? 'bg-success-bg text-success'
      : role === 'teal'
        ? 'bg-info-bg text-info'
        : 'bg-surface-elevated text-muted'
  return (
    <div
      className={`w-10 h-10 rounded-full ${tint} text-xs font-bold flex items-center justify-center shrink-0 select-none`}
      aria-hidden
    >
      {initials}
    </div>
  )
}

function FeedPanel() {
  return (
    <>
      <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-3 mb-3">
          <Avatar initials="MR" role="jade" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-text truncate">Maya R.</span>
              <RoleBadge role="host" className="text-[9px] leading-tight" />
            </div>
            <p className="text-2xs text-subtle mt-0.5">@maya · 12m · Sunrise Breathwork</p>
          </div>
        </div>
        <p className="text-sm text-text leading-relaxed">
          Eleven of us on the bluff before work this morning. Cold, gold, quiet. I
          forget how much I need this until I&apos;m back in it.
        </p>
        <div className="mt-3 flex items-center gap-5 text-subtle">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <Heart className="w-4 h-4 text-primary" aria-hidden />
            <span className="text-text">9</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <MessageCircle className="w-4 h-4" aria-hidden />
            <span className="text-text">4</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <Zap className="w-4 h-4 text-signal-strong" aria-hidden />
            <span className="text-text">3</span>
          </span>
        </div>
      </article>

      <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-3 mb-2">
          <Avatar initials="DT" role="stone" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-text truncate">Devon T.</span>
              <RoleBadge role="crew" className="text-[9px] leading-tight" />
            </div>
            <p className="text-2xs text-subtle mt-0.5">@devon · 1h · Saturday Sauna</p>
          </div>
        </div>
        <p className="text-sm text-text leading-relaxed">
          Who&apos;s in for the thermal circuit Saturday? Three rounds, then coffee at
          the connection bar. First-timers welcome.
        </p>
      </article>
    </>
  )
}

function CirclesPanel() {
  return (
    <>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-1 text-3xs font-bold uppercase tracking-widest text-primary-strong">
            <Sparkles className="w-3 h-3" aria-hidden />
            Movement
          </span>
        </div>
        <h3 className="font-display uppercase text-text text-2xl mt-2 leading-none">
          Sunrise Breathwork
        </h3>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Mornings on Moonlight Beach. Eight regulars, room for a few more.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex -space-x-2" aria-hidden>
            {['MR', 'JL', 'AC', 'SK'].map((i, n) => (
              <span
                key={i}
                className={`w-7 h-7 rounded-full border-2 border-surface text-[9px] font-bold flex items-center justify-center ${
                  n % 2 === 0
                    ? 'bg-success-bg text-success'
                    : 'bg-info-bg text-info'
                }`}
              >
                {i}
              </span>
            ))}
            <span className="w-7 h-7 rounded-full border-2 border-surface bg-surface-elevated text-[9px] font-bold text-muted flex items-center justify-center">
              +4
            </span>
          </div>
          <span className="text-2xs font-bold uppercase tracking-widest text-primary-strong">
            Join Circle
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-2.5 py-1 text-3xs font-bold uppercase tracking-widest text-info">
          <Sparkles className="w-3 h-3" aria-hidden />
          Human relating
        </span>
        <h3 className="font-display uppercase text-text text-2xl mt-2 leading-none">
          Thursday Men&apos;s Table
        </h3>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Small by design. Filling up: a second table seeds soon.
        </p>
      </div>
    </>
  )
}

function EventRow({
  month,
  day,
  title,
  meta,
}: {
  month: string
  day: string
  title: string
  meta: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="shrink-0 w-11 h-11 rounded-xl bg-primary-bg flex flex-col items-center justify-center">
        <span className="text-[8px] font-bold text-primary-strong leading-none">{month}</span>
        <span className="text-base font-bold text-primary-strong leading-tight">{day}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{title}</p>
        <p className="text-2xs text-subtle mt-0.5">{meta}</p>
      </div>
      <span className="text-2xs font-bold uppercase tracking-widest text-primary-strong shrink-0">
        RSVP
      </span>
    </div>
  )
}

function EventsPanel() {
  return (
    <>
      <EventRow month="JUN" day="6" title="Cold plunge + breath circuit" meta="Sat 7:00a · The Lab" />
      <EventRow month="JUN" day="9" title="Sunrise breathwork on the bluff" meta="Tue 6:15a · Moonlight Beach" />
      <EventRow month="JUN" day="12" title="Connection bar: open evening" meta="Fri 6:30p · The Lab" />
      <EventRow month="JUN" day="14" title="Ecstatic dance + sound bath" meta="Sun 5:00p · Events floor" />
    </>
  )
}

// One example of giving a Zap. Day zero has no real activity, so this illustrates
// what a Zap IS (a note of gratitude to a real person) without inventing members,
// counts, or a leaderboard (docs/CONTENT-VOICE honest-day-zero rule).
function ZapExample({ note, to }: { note: string; to: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal-bg text-signal-strong"
        aria-hidden
      >
        <Zap className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm leading-snug text-text">
        <span className="font-semibold">{note}</span> <span className="text-muted">to {to}</span>
      </p>
    </div>
  )
}

function ZapsPanel() {
  return (
    <>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-signal-strong" aria-hidden />
          <span className="text-2xs font-bold uppercase tracking-widest text-muted">
            How a Zap works
          </span>
        </div>
        <div className="space-y-2">
          <ZapExample note="Thanks for hosting tonight." to="your Circle host" />
          <ZapExample note="You made the new person feel at home." to="a regular" />
          <ZapExample note="Glad you showed up." to="a friend" />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <Repeat className="w-5 h-5 text-primary shrink-0" aria-hidden />
        <p className="text-xs text-muted leading-relaxed">
          Zaps are gratitude, not points. Give one when someone shows up for you.
        </p>
      </div>
    </>
  )
}
