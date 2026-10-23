'use client'

import '@/app/themes/active/pricing-box'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { isError } from '@/lib/action-result'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { TierChip } from '@/components/pricing/tier-chip'
import { Input } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { PRICING_TIERS_TINT } from '@/lib/theme/pricing-tints'
import {
  startSpaceLoadoutCheckout,
  settleSpaceLoadoutAction,
  openSpaceBillingPortal,
} from '@/app/(main)/spaces/[slug]/settings/billing/actions'
import {
  startMembershipCheckout,
  settleMembershipCheckoutAction,
  toggleMembership,
} from '@/app/(main)/upgrade/actions'
import { INDEPENDENT_CONTACT_HREF } from '@/lib/pricing/network-contact'
import {
  PRICING_TIER_KEYS,
  tierForSpacePlan,
  type PricingBoxData,
  type PricingPersonalContext,
  type PricingSpaceContext,
  type PricingTier,
  type PricingTierKey,
} from '@/lib/pricing/member-pricing'

// THE MEMBER PRICING BOX (design_handoff_member_pricing). One compact plan picker for every member surface:
// six rungs on one ladder (Member, Crew, Space, Business, Collective, Network), a detail panel for the
// selected rung, a lightweight comparison grid and an inline checkout under the button. It replaces the old
// plan ladder and the per-allowance boxes everywhere (/offer, Space billing, /upgrade, the limit prompts).
//
// 🔴 IT DRAWS WHAT IT IS GIVEN. Every price, allowance and fee arrives resolved from the catalog
// (lib/pricing/member-pricing.ts); nothing here is typed or computed beyond choosing a column. The checkout
// is the existing one: Space plans through startSpaceLoadoutCheckout, Crew through startMembershipCheckout,
// both rendered by CheckoutPanel (Stripe Elements, hosted fallback), never a raw card input. A Space that
// already pays changes plan in the Stripe billing portal, because a second checkout would bill it twice.
//
// MOTION: one tier per wheel gesture, the price counts up straight into its text node (no re-render per
// frame), the entrance plays once when 15% is in view, and prefers-reduced-motion skips all of it.

type Period = 'month' | 'year'

type Action =
  | { kind: 'current'; label: string }
  | { kind: 'disabled'; label: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'crew'; label: string }
  | { kind: 'beta'; label: string }
  | { kind: 'portal'; label: string }
  | { kind: 'space'; label: string; plan: 'business' | 'nonprofit' | 'collective' | 'nonprofit_collective' | 'network' }

const WHEEL_GESTURE_MS = 200
const WHEEL_COOLDOWN_MS = 750

/** Whole dollars with a thousands separator, the way the count-up writes a plan price. */
const whole = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`

/** An exact amount: "$5", and "$4.99" for the Crew floor, which must never read as a rounded "$5". */
const money = (cents: number): string => {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars.toLocaleString('en-US')}` : `$${dollars.toFixed(2)}`
}

export function MemberPricingBox({
  data,
  focus,
  personal,
  space,
}: {
  data: PricingBoxData
  /** Which axis the "current" mark and the opening selection follow. */
  focus: 'space' | 'personal'
  personal: PricingPersonalContext
  space: PricingSpaceContext | null
}) {
  const router = useRouter()
  const tiers = data.tiers
  const spaceTier: PricingTierKey | null = space ? tierForSpacePlan(space.plan) : null
  const current: PricingTierKey = focus === 'space' && spaceTier ? spaceTier : personal.tier
  const currentIndex = Math.max(0, PRICING_TIER_KEYS.indexOf(current))

  const [selected, setSelected] = useState<PricingTierKey>(PRICING_TIER_KEYS[Math.min(currentIndex + 1, 5)] ?? 'collective')
  const [period, setPeriod] = useState<Period>('month')
  const [nonprofit, setNonprofit] = useState<boolean>(space?.verified ?? false)
  const [entered, setEntered] = useState(false)
  const [dotsIn, setDotsIn] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [crewCents, setCrewCents] = useState<number>(data.crew.suggestedCents)
  const [crewOther, setCrewOther] = useState('')
  const [networkPackage, setNetworkPackage] = useState(false)
  const [session, setSession] = useState<{ key: string; clientSecret: string; sessionId: string | null } | null>(null)

  const rootRef = useRef<HTMLElement | null>(null)
  const priceRef = useRef<HTMLSpanElement | null>(null)
  const lastPrice = useRef<{ cents: number | null; label: string } | null>(null)
  const raf = useRef(0)
  const wheel = useRef({ lastEvent: 0, lastStep: 0, acc: 0 })
  const requestId = useRef(0)

  const selectedIndex = PRICING_TIER_KEYS.indexOf(selected)
  const tier = tiers[selectedIndex]!
  const tint = PRICING_TIERS_TINT[selectedIndex]!
  const yearly = period === 'year'
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  /** The price a rung shows for the chosen interval and Non Profit switch, or null when it has none (Crew). */
  const priceOf = useCallback(
    (t: PricingTier): number | null => {
      if (t.pwyw) return null
      if (nonprofit && t.nonprofitMonthlyCents !== null) return yearly ? t.nonprofitYearlyCents : t.nonprofitMonthlyCents
      return yearly ? t.yearlyCents : t.monthlyCents
    },
    [nonprofit, yearly],
  )
  const price = priceOf(tier)
  const priceText = tier.pwyw ? 'Your price' : `${tier.from && price ? 'From ' : ''}${money(price ?? 0)}`
  const per = tier.pwyw || !price ? '' : yearly ? '/yr' : '/mo'
  const listCents = nonprofit ? null : yearly ? tier.listYearlyCents : tier.listMonthlyCents

  // Entrance: once, when 15% of the box is in view. prefers-reduced-motion is honoured in the sheet, which
  // shows everything at once and drops every transition.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    let dotTimer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setEntered(true)
        dotTimer = setTimeout(() => setDotsIn(true), 1200)
        io.disconnect()
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (dotTimer) clearTimeout(dotTimer)
    }
  }, [])

  const choose = useCallback(
    (key: PricingTierKey) => {
      if (key === selected) return
      setSelected(key)
      setOpen(false)
      setOpened(false)
      setError(null)
      setSession(null)
      if (!reduced) {
        setSwapping(true)
        setTimeout(() => setSwapping(false), 30)
      }
    },
    [selected, reduced],
  )

  // Scroll-through: one rung per gesture. At the ends, and while the checkout is open, the page scrolls as normal.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent) => {
      if (open || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
      const w = wheel.current
      const dir = e.deltaY > 0 ? 1 : -1
      const next = PRICING_TIER_KEYS[PRICING_TIER_KEYS.indexOf(selected) + dir]
      const now = performance.now()
      const gap = now - w.lastEvent
      w.lastEvent = now
      if (!next) {
        if (now - w.lastStep < 700) e.preventDefault()
        return
      }
      e.preventDefault()
      if (gap < WHEEL_GESTURE_MS && now - w.lastStep < WHEEL_COOLDOWN_MS) return
      w.acc = (gap < WHEEL_GESTURE_MS ? w.acc : 0) + Math.abs(e.deltaY)
      if (w.acc < 12) return
      w.acc = 0
      w.lastStep = now
      choose(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, selected, choose])

  // Price count-up, written straight into the text node (never a re-render per frame).
  useLayoutEffect(() => {
    const node = priceRef.current?.firstChild
    const prev = lastPrice.current
    lastPrice.current = { cents: price, label: priceText }
    cancelAnimationFrame(raf.current)
    if (!node || reduced || !prev || prev.cents === null || price === null || prev.cents === price) return undefined
    const from = prev.cents
    const prefix = tier.from ? 'From ' : ''
    node.nodeValue = `${prefix}${whole(from)}`
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 520)
      const eased = 1 - Math.pow(1 - k, 3)
      node.nodeValue = k < 1 ? `${prefix}${whole(from + (price - from) * eased)}` : priceText
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // price text derives from price and tier; both are in the deps through `price` and `priceText`.
  }, [price, priceText, tier.from, reduced])

  /** What the main button does for a rung, from the viewer's tier, the Space and what sells. */
  const actionFor = useCallback(
    (t: PricingTier): Action => {
      const idx = PRICING_TIER_KEYS.indexOf(t.key)
      if (t.key === 'member') {
        if (personal.tier === 'member') return { kind: 'current', label: 'Your current plan' }
        // Crew is the only paid personal tier, so going back to Member is leaving Crew: the free beta toggle,
        // or the billing page once billing is live.
        return personal.betaOpen
          ? { kind: 'beta', label: 'Back to Member' }
          : { kind: 'link', label: 'Manage Crew in Billing', href: '/settings/billing' }
      }
      if (t.key === 'crew') {
        if (personal.tier === 'crew') return { kind: 'current', label: 'Your current plan' }
        if (personal.betaOpen) return { kind: 'beta', label: 'Join the Crew, free during beta' }
        if (personal.crewSellable) return { kind: 'crew', label: 'Join the Crew' }
        return { kind: 'disabled', label: 'Crew opens soon' }
      }
      // Space rungs.
      if (!space) return { kind: 'link', label: t.key === 'space' ? 'Open a Space' : `Open a Space for ${t.name}`, href: '/spaces/new' }
      if (spaceTier === t.key) return { kind: 'current', label: 'Your current plan' }
      if (space.inherited) return { kind: 'disabled', label: 'Included through your Network' }
      if (space.managed) return { kind: 'disabled', label: 'Managed by the crew. Reach out to change it' }
      if (!space.canBuy) return { kind: 'disabled', label: 'Only the Space owner can change the plan' }
      const spaceIdx = spaceTier ? PRICING_TIER_KEYS.indexOf(spaceTier) : 2
      const verb = idx > spaceIdx ? 'Upgrade to' : 'Switch to'
      if (t.key === 'space') return { kind: 'portal', label: `${verb} ${t.name}` }
      if (nonprofit && t.nonprofitMonthlyCents !== null && !space.verified) {
        return { kind: 'link', label: 'Get verified for Non Profit pricing', href: `/spaces/${space.slug}/settings/billing/verify` }
      }
      const plan = (
        t.key === 'business'
          ? nonprofit && space.verified
            ? 'nonprofit'
            : 'business'
          : t.key === 'collective'
            ? nonprofit && space.verified
              ? 'nonprofit_collective'
              : 'collective'
            : 'network'
      ) as Extract<Action, { kind: 'space' }>['plan']
      if (!space.sellable[plan]) return { kind: 'disabled', label: 'Available soon' }
      if (space.paid) return { kind: 'portal', label: `${verb} ${t.name}` }
      return { kind: 'space', label: `${verb} ${t.name}`, plan }
    },
    [personal, space, spaceTier, nonprofit],
  )

  const action = actionFor(tier)

  const openPortal = useCallback(() => {
    if (!space) return
    setError(null)
    startTransition(async () => {
      const res = await openSpaceBillingPortal(space.slug)
      if (isError(res)) setError(res.error)
      else window.location.href = res.data.url
    })
  }, [space])

  const joinBeta = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const res = await toggleMembership()
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }, [router])

  const crewAmount = useMemo(() => {
    const typed = crewOther.trim() === '' ? NaN : Math.round(Number(crewOther.replace(/[^0-9.]/g, '')) * 100)
    return crewOther.trim() === '' ? crewCents : typed
  }, [crewCents, crewOther])
  const crewValid = Number.isFinite(crewAmount) && crewAmount >= data.crew.minCents

  /** Mint the Space plan session for the open checkout. A newer request wins; a stale answer is dropped. */
  const mintSpace = useCallback(
    (a: Extract<Action, { kind: 'space' }>, interval: Period, pkg: boolean) => {
      if (!space) return
      const key = `${a.plan}-${interval}-${pkg}`
      const id = ++requestId.current
      setSession(null)
      setError(null)
      warmStripeBrowser()
      void startSpaceLoadoutCheckout(space.slug, { plan: a.plan, interval, networkPackage: a.plan === 'network' && interval === 'year' && pkg }).then((res) => {
        if (id !== requestId.current) return
        if (isError(res)) setError(res.error)
        else if (res.data.clientSecret) setSession({ key, clientSecret: res.data.clientSecret, sessionId: res.data.sessionId ?? null })
        else if (res.data.url) window.location.href = res.data.url
      })
    },
    [space],
  )

  const mintCrew = useCallback(() => {
    if (!crewValid) {
      setError(`Choose ${money(data.crew.minCents)} a month or more.`)
      return
    }
    if (crewAmount > data.crew.maxCents && !window.confirm(`That is ${money(crewAmount)} a month, every month. Is that what you meant?`)) return
    const key = `crew-${crewAmount}-${period}`
    const id = ++requestId.current
    setSession(null)
    setError(null)
    warmStripeBrowser()
    startTransition(async () => {
      const res = await startMembershipCheckout(crewAmount, yearly ? 'annual' : 'monthly')
      if (id !== requestId.current) return
      if (isError(res)) setError(res.error)
      else if (res.data.clientSecret) setSession({ key, clientSecret: res.data.clientSecret, sessionId: res.data.sessionId ?? null })
      else if (res.data.url) window.location.href = res.data.url
    })
  }, [crewValid, crewAmount, data.crew.minCents, data.crew.maxCents, period, yearly])

  const hostedFallback = useCallback(() => {
    setSession(null)
    setError('Opening secure checkout…')
    startTransition(async () => {
      if (action.kind === 'space' && space) {
        const res = await startSpaceLoadoutCheckout(space.slug, { plan: action.plan, interval: period, networkPackage: action.plan === 'network' && yearly && networkPackage, forceHosted: true })
        if (!isError(res) && res.data.url) window.location.href = res.data.url
        else setError('Could not start checkout. Please try again.')
      } else if (action.kind === 'crew') {
        const res = await startMembershipCheckout(crewAmount, yearly ? 'annual' : 'monthly', { forceHosted: true })
        if (!isError(res) && res.data.url) window.location.href = res.data.url
        else setError('Could not start checkout. Please try again.')
      }
    })
  }, [action, space, period, yearly, networkPackage, crewAmount])

  /** Press a rung's button, from the panel or the comparison row. */
  const activate = useCallback(
    (key: PricingTierKey) => {
      const t = tiers[PRICING_TIER_KEYS.indexOf(key)]!
      if (key !== selected) {
        // Selecting changes nothing else; the second press acts. Mirrors the prototype's openCo(k).
        choose(key)
      }
      const a = actionFor(t)
      if (a.kind === 'link') router.push(a.href)
      else if (a.kind === 'portal') openPortal()
      else if (a.kind === 'beta') joinBeta()
      else if (a.kind === 'space' || a.kind === 'crew') {
        setOpen(true)
        setTimeout(() => setOpened(true), 20)
        if (a.kind === 'space') mintSpace(a, period, networkPackage)
      }
    },
    [tiers, selected, choose, actionFor, router, openPortal, joinBeta, mintSpace, period, networkPackage],
  )

  const closeCheckout = useCallback(() => {
    requestId.current++
    setOpen(false)
    setOpened(false)
    setSession(null)
    setError(null)
  }, [])

  /** Switching the interval re-opens the Space plan session at the new interval (a Crew session re-asks on its button). */
  function changePeriod(next: Period) {
    setPeriod(next)
    if (open && action.kind === 'space') mintSpace(action, next, networkPackage)
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const next = PRICING_TIER_KEYS[selectedIndex + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)]
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && next) {
      e.preventDefault()
      choose(next)
    }
  }

  const nextTier = tiers[selectedIndex + 1]
  // The mark carries the viewer's real plan label (Non Profit, Independent), not just the rung it sits on.
  const currentMark = focus === 'space' && space ? (space.plan as Parameters<typeof TierChip>[0]['tier']) : personal.tier
  const swapStyle: CSSProperties = swapping
    ? ({ '--pbx-swap-left': 0.55, '--pbx-swap-y': 'translateY(6px)', '--pbx-swap-feature': 0.15, '--pbx-swap-fx': 'translateX(-6px)' } as CSSProperties)
    : ({ '--pbx-swap-tr': 'opacity 420ms cubic-bezier(.2,.7,.3,1),transform 520ms cubic-bezier(.18,1.3,.4,1)' } as CSSProperties)

  // ── the checkout's order summary ─────────────────────────────────────────────────────────────────
  const isCrewCheckout = action.kind === 'crew'
  const summaryCents = isCrewCheckout ? (crewValid ? (yearly ? crewAmount * 10 : crewAmount) : 0) : price ?? 0
  const trial = !isCrewCheckout && data.trialDays > 0
  const total = trial ? 0 : summaryCents
  const sessionKey = isCrewCheckout ? `crew-${crewAmount}-${period}` : action.kind === 'space' ? `${action.plan}-${period}-${networkPackage}` : ''
  const liveSession = session && session.key === sessionKey ? session : null

  return (
    <section
      ref={rootRef}
      className={`pbx${entered ? ' is-in' : ''}`}
      data-screen-label="Pricing box"
      aria-label="Plans"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ '--pbx-tint': tint } as CSSProperties}
    >
      <div className="pbx-head pbx-rise" style={{ '--pbx-dy': '18px' } as CSSProperties}>
        <div className="pbx-head-copy">
          <h2 className="pbx-title">Find the plan that fits</h2>
          <p className="pbx-sub">
            {hovered ? (
              'Scroll or tap. Take your time.'
            ) : (
              <>
                You’re on <TierChip tier={currentMark} size="md" /> today. Every step up adds a little more room.
              </>
            )}
          </p>
        </div>
        <div className="pbx-period" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={!yearly} onClick={() => changePeriod('month')}>Monthly</button>
          <button type="button" role="radio" aria-checked={yearly} onClick={() => changePeriod('year')}>Yearly · 2 months free</button>
        </div>
      </div>

      <div className="pbx-ladder pbx-rise" style={{ '--pbx-dy': '24px', '--pbx-delay': '120ms' } as CSSProperties} role="tablist" aria-label="Plans" tabIndex={0} onKeyDown={onKey}>
        <div className="pbx-rungs">
          <div className="pbx-track" aria-hidden="true" />
          <div className="pbx-fill" aria-hidden="true" style={{ width: entered ? `${((selectedIndex / 5) * 83.33).toFixed(2)}%` : '0%' }} />
          {tiers.map((t, i) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`pbx-tab-${t.key}`}
              aria-selected={t.key === selected}
              aria-controls="pbx-panel"
              tabIndex={-1}
              className={`pbx-rung${i < selectedIndex ? ' is-passed' : ''}`}
              style={{ '--pbx-tint': PRICING_TIERS_TINT[i], '--pbx-dot-delay': dotsIn ? '0ms' : `${180 + i * 70}ms` } as CSSProperties}
              onClick={() => choose(t.key)}
            >
              <span className="pbx-group">{t.group}</span>
              <span className="pbx-dot" />
              <span className="pbx-name">{t.name}</span>
              <span className="pbx-verb">{t.verb}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="pbx-panel" role="tabpanel" aria-labelledby={`pbx-tab-${selected}`} className="pbx-panel pbx-rise" style={{ '--pbx-dy': '40px', '--pbx-delay': '360ms', ...swapStyle } as CSSProperties}>
        <div className="pbx-orb" aria-hidden="true" />
        <div className="pbx-left">
          <span className="pbx-step">{selectedIndex + 1} of 6</span>
          <span className="pbx-tier">
            {tier.name} <em>{tier.verb}</em>
          </span>
          <div className="pbx-price">
            <b ref={priceRef}>{priceText}</b>
            {listCents ? <s aria-label={`List price ${money(listCents)}`}>{money(listCents)}</s> : null}
            {per ? <span>{per}</span> : null}
          </div>
          <p className="pbx-fit">{tier.fit}</p>
          <p className="pbx-note">
            {nonprofit && tier.nonprofitMonthlyCents !== null
              ? `Verified nonprofit price, no network fee. ${yearly ? 'Ten months of the monthly price.' : 'Or two months free yearly.'}`
              : tier.note[period]}
          </p>
        </div>
        <div className="pbx-right">
          <span className="pbx-lead">{selectedIndex > 2 ? `Everything in ${tiers[selectedIndex - 1]!.name}, plus` : 'What you get'}</span>
          {tier.features.map((f, i) => (
            <span key={f} className="pbx-feature" style={{ '--pbx-feature-tr': swapping ? 'none' : `opacity 360ms ease ${80 + i * 55}ms,transform 460ms cubic-bezier(.18,1.3,.4,1) ${80 + i * 55}ms` } as CSSProperties}>
              {f}
            </span>
          ))}
        </div>

        <div className="pbx-foot">
          <button
            type="button"
            className="pbx-cta"
            disabled={action.kind === 'current' || action.kind === 'disabled' || pending}
            onClick={() => activate(tier.key)}
            onPointerEnter={warmStripeBrowser}
            onFocus={warmStripeBrowser}
          >
            {pending && action.kind !== 'current' ? 'One moment' : action.label}
          </button>
          {nextTier ? (
            <button type="button" className="pbx-next" onClick={() => choose(nextTier.key)}>
              See how {nextTier.name} {nextTier.verb} <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>

        {open && (action.kind === 'space' || action.kind === 'crew') ? (
          <div className={`pbx-co${opened ? ' is-open' : ''}`} aria-live="polite">
            <div className="pbx-co-col">
              <span className="pbx-label">Your order</span>
              <span className="pbx-co-title">
                {tier.name}, {yearly ? 'yearly' : 'monthly'}
              </span>
              {isCrewCheckout ? (
                <>
                  <div className="pbx-chips">
                    {data.crew.presetCents.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="pbx-chip"
                        aria-pressed={crewOther.trim() === '' && crewCents === c}
                        onClick={() => {
                          setCrewCents(c)
                          setCrewOther('')
                          setSession(null)
                        }}
                      >
                        {money(c)}/mo
                      </button>
                    ))}
                  </div>
                  <Input
                    inputMode="decimal"
                    value={crewOther}
                    onChange={(e) => {
                      setCrewOther(e.target.value)
                      setSession(null)
                    }}
                    placeholder="Another amount a month"
                    aria-label="Another amount per month, in dollars"
                  />
                </>
              ) : null}
              {action.kind === 'space' && action.plan === 'network' && yearly ? (
                <Checkbox
                  wrapperClassName="pbx-note"
                  checked={networkPackage}
                  onChange={(e) => {
                    setNetworkPackage(e.target.checked)
                    if (action.kind === 'space') mintSpace(action, period, e.target.checked)
                  }}
                  label="Yearly package: ten chapters, pay for eight, with an onboarding session and priority support"
                />
              ) : null}
              <div className="pbx-lines">
                <span>
                  <span>{tier.name}</span>
                  <span>{isCrewCheckout ? (crewValid ? `${money(summaryCents)}${yearly ? '/yr' : '/mo'}` : 'Choose an amount') : `${money(summaryCents)}${yearly ? '/yr' : '/mo'}`}</span>
                </span>
                <span className="is-muted">
                  <span>Card processing</span>
                  <span>Passed through</span>
                </span>
              </div>
              <span className="pbx-due">
                <span>Due today</span>
                <b>{money(total)}</b>
              </span>
              <p className="pbx-note">
                {trial
                  ? `Free for ${data.trialDays} days, then ${money(summaryCents)}${yearly ? '/yr' : '/mo'}. Cancel before the trial ends and nothing is charged. `
                  : ''}
                The price you start on is yours for as long as you keep the plan. Change or cancel any time in Billing.
              </p>
            </div>
            <div className="pbx-co-col">
              <span className="pbx-label">Pay with card</span>
              {isCrewCheckout && !liveSession ? (
                <button type="button" className="pbx-cta" onClick={mintCrew} disabled={pending || !crewValid}>
                  {pending ? 'Opening checkout' : crewValid ? `Continue with ${money(summaryCents)}${yearly ? '/yr' : '/mo'}` : `Choose ${money(data.crew.minCents)} or more`}
                </button>
              ) : (
                <CheckoutPanel
                  clientSecret={liveSession?.clientSecret ?? null}
                  priceLabel={money(total)}
                  onFellBack={hostedFallback}
                  onPaid={
                    liveSession?.sessionId
                      ? () => (isCrewCheckout ? settleMembershipCheckoutAction(liveSession.sessionId as string) : settleSpaceLoadoutAction(liveSession.sessionId as string))
                      : undefined
                  }
                  onClose={() => window.location.reload()}
                  doneTitle={isCrewCheckout ? 'You are in the Crew.' : `You’re on ${tier.name}.`}
                  doneBody="A receipt is on its way to your email."
                />
              )}
              <button type="button" className="pbx-quiet" onClick={closeCheckout}>
                Not now
              </button>
              {error ? <p className="pbx-error" role="alert">{error}</p> : null}
            </div>
          </div>
        ) : error ? (
          <p className="pbx-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</p>
        ) : null}
      </div>

      <div className="pbx-compare-wrap pbx-rise" style={{ '--pbx-dy': '40px', '--pbx-delay': '600ms' } as CSSProperties}>
        <span className="pbx-label">Side by side</span>
        <div className="pbx-compare" role="group" aria-label={`Side by side, ${data.allowances} allowances compared`}>
          <div className="pbx-grid">
            <span />
            {tiers.map((t, i) => (
              <button key={t.key} type="button" className={`pbx-chead${t.key === selected ? ' pbx-col-on' : ''}`} style={{ '--pbx-tint': PRICING_TIERS_TINT[i] } as CSSProperties} onClick={() => choose(t.key)}>
                {t.name}
              </button>
            ))}
            {data.comparison.map((row) => (
              <RowCells key={row.label} label={row.label} cells={row.cells} selectedIndex={selectedIndex} />
            ))}
            <span className="pbx-cell is-label" />
            {tiers.map((t, i) => {
              const a = actionFor(t)
              const isCurrent = a.kind === 'current'
              const label = isCurrent ? 'Current' : t.key === 'member' ? 'Back' : t.key === 'crew' ? (personal.tier === 'crew' ? 'Current' : 'Join') : i > (spaceTier ? PRICING_TIER_KEYS.indexOf(spaceTier) : 2) ? 'Upgrade' : 'Switch'
              const up = !isCurrent && (t.key === 'crew' ? personal.tier === 'member' : t.key !== 'member' && i > (spaceTier ? PRICING_TIER_KEYS.indexOf(spaceTier) : 2))
              return (
                <span key={t.key} className={`pbx-cell is-cta${i === selectedIndex ? ' pbx-col-on' : ''}`} style={{ '--pbx-tint': PRICING_TIERS_TINT[i] } as CSSProperties}>
                  <button type="button" className={`pbx-pill${up ? ' is-up' : ''}`} disabled={isCurrent || (a.kind === 'disabled' && t.key === 'member')} onClick={() => activate(t.key)}>
                    {label}
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="pbx-foot2">
        <button type="button" className="pbx-np" role="switch" aria-checked={nonprofit} onClick={() => { setNonprofit((v) => !v); setSession(null) }}>
          <i aria-hidden="true" />
          Verified nonprofit, no network fee
        </button>
        <span>
          White label? <a href={INDEPENDENT_CONTACT_HREF}>Ask about Independent</a>
        </span>
      </div>
    </section>
  )
}

/** One comparison row: the label, then a cell per rung, the selected column tinted. */
function RowCells({ label, cells, selectedIndex }: { label: string; cells: string[]; selectedIndex: number }) {
  return (
    <>
      <span className="pbx-cell is-label">{label}</span>
      {cells.map((v, i) => (
        <span key={i} className={`pbx-cell${v === '–' ? ' is-none' : ''}${i === selectedIndex ? ' pbx-col-on' : ''}`} style={{ '--pbx-tint': PRICING_TIERS_TINT[i] } as CSSProperties}>
          {v}
        </span>
      ))}
    </>
  )
}
