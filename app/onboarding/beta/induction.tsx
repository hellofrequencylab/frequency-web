'use client'

// Beta induction — the founding-cohort flow (ADR-068, docs/BETA-INDUCTION.md).
// TEMPORARY: deleted at launch. Centered, warm-light cinematic sequence; logo on
// top, content centered with a generous buffer, progress pinned to the bottom.
// Scripted Vera (hot register). The `preview` prop mocks the auth writes; the
// city search + reel run for real in preview too.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import { downscaleImageFile } from '@/lib/images/downscale-image'
import { searchPlaces, type PlaceSuggestion } from '@/lib/geocode'
import { BETA_OATHS as DEFAULT_OATHS, VERA as DEFAULT_VERA, type OathId, type VeraCopy } from '@/lib/onboarding/beta-script'
import { getPersona, listPersonas, isPersonaId, DEFAULT_PERSONA, type PersonaId } from '@/lib/onboarding/personas'
import type { FunnelFeature, FunnelCoreFeature, FunnelDestination } from '@/lib/onboarding/beta-sequences'
import { funnelIcon } from '@/lib/onboarding/funnel-icons'
import { isSafeInAppPath } from '@/lib/onboarding/funnel-destination'
import { acceptBetaOath, completeBetaInduction, stashPendingInduction } from './actions'
import { logPersonaSelection } from './persona-log'
import { uploadProfileImageAction } from '@/app/(main)/settings/profile/actions'
import { signInWithMagicLink, signInWithGoogle } from '@/app/sign-in/actions'

// Avatar can't ride the auth-redirect in a cookie, so the deferred (signed-out)
// flow parks its data URL in localStorage and the /complete page uploads it.
const PENDING_AVATAR_KEY = 'fq_pending_avatar'
import { FeedRender } from '@/components/onboarding/renders/feed-render'
import { CirclesRender } from '@/components/onboarding/renders/circles-render'
import { EventsRender } from '@/components/onboarding/renders/events-render'
import { BookingRender } from '@/components/onboarding/renders/booking-render'
import { CheckinRender } from '@/components/onboarding/renders/checkin-render'
import { DonateRender } from '@/components/onboarding/renders/donate-render'
import { TicketsRender } from '@/components/onboarding/renders/tickets-render'
import { CrmRender } from '@/components/onboarding/renders/crm-render'
import { WizardProgress, wizardPrimaryClass } from '@/components/templates'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

type Props = {
  userId?: string
  userEmail?: string
  initialHandle?: string
  /** Legacy prop (region list) — no longer used; city is free-search now. */
  regions?: { id: string; name: string }[]
  /** Preview mode: no auth, no server writes — for the public /preview route only. */
  preview?: boolean
  /** Deferred mode: signed-out visitor runs the whole induction with no login wall;
   *  answers are stashed and sign-in is collected at the final "step in" beat, after
   *  which /onboarding/beta/complete writes the profile. */
  deferred?: boolean
  /** Operator copy overrides from /admin/vera (defaults to the beta-script copy). */
  copy?: {
    vera?: VeraCopy
    oaths?: { id: OathId; label: string }[]
    heardAbout?: string[]
  }
  /** The audience sequence slug (early-adopter / personal / founding-partner).
   *  Dropped into a cookie so completion can stamp the marketing tag + record it,
   *  surviving the deferred sign-in round-trip. */
  sequence?: string
  /** The persona the visitor chose in the lead flow (?persona=). Pre-selects the
   *  Welcome-beat picker; defaults to Visitor. Carried in a cookie so completion can
   *  stamp meta.persona + the persona tag, and branches the tour reel. */
  persona?: PersonaId
  /** Open the flow at a specific beat (0–4). Used by the /pages/splash editor to
   *  preview the REAL component one beat at a time; the flow logic is untouched. */
  initialBeat?: number
  /** Set when the visitor scanned a member's QR code (the fq_ref referrer). Shows an
   *  "Invited by {name}" chip atop the flow so the welcome reads personal. */
  inviter?: { displayName: string; handle: string; avatarUrl: string | null } | null
  /** NICHE funnel (ADR-funnels): the 4 "what are you into" cards shown on Beat 1 in place of
   *  the persona fork. Absent / empty = keep the persona fork (the General funnel). */
  slide2Features?: FunnelFeature[]
  /** NICHE funnel: the 3 pick-one core features (with art) shown on Beat 2 in place of the
   *  auto-playing tour reel. Absent / empty = keep the reel (the General funnel). */
  slide3Core?: FunnelCoreFeature[]
  /** NICHE funnel: where completion sends the member. A safe in-app `direct` url overrides the
   *  default post-induction landing; waitlist / absent keeps today's behaviour (the General funnel). */
  destination?: FunnelDestination
}

const HANDLE_RE = /^[a-z0-9_]+$/
const RENDERS = { feed: FeedRender, circles: CirclesRender, events: EventsRender, booking: BookingRender, checkin: CheckinRender, donate: DonateRender, tickets: TicketsRender, crm: CrmRender }
const BEAT_COUNT = 5 // 0 oath · 1 intro · 2 reel · 3 identity+place · 4 enter
// Accessible name for each beat — drives the progress bar's label and the polite
// live announcement so assistive tech tracks "where am I" through the sequence.
const BEAT_LABELS = ['The promise', 'Who you are', 'A quick tour', 'Your profile', 'Step in']

// No separator — "Daniel Tyack" → "danieltyack".
function suggestHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M4 10h11M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Beat headings come from the (operator-editable) copy. A word wrapped in
// *asterisks* renders in the brand accent — the same convention as the splash
// "statement" line — so the default "You're a *member.*" keeps its highlight
// and edited headings can carry one too.
function accent(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <span key={i} className="text-primary">{part.slice(1, -1)}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export default function BetaInduction({ userId = '', userEmail = '', initialHandle = '', preview = false, deferred = false, copy, sequence, persona: initialPersona, initialBeat = 0, inviter = null, slide2Features, slide3Core, destination }: Props) {
  // NICHE-funnel forks (ADR-funnels). A non-empty set flips one beat over to the niche
  // layout; both absent keeps the whole flow identical to the General funnel.
  const hasNicheFeatures = (slide2Features?.length ?? 0) > 0 // Beat 1: cards vs persona fork
  const hasCoreFeatures = (slide3Core?.length ?? 0) > 0 // Beat 2: pick-3 vs auto-reel
  // Operator-tunable copy (defaults to the beta-script copy) — shadows the imports so
  // every existing VERA./BETA_OATHS reference picks up the overrides.
  const VERA = copy?.vera ?? DEFAULT_VERA
  const BETA_OATHS = copy?.oaths ?? DEFAULT_OATHS

  // Personas (who they said they are). MULTI-select — a Founder can be more than one
  // thing (a practitioner who also wants to build). Pre-seeded from the lead-flow URL.
  // The FIRST selected is the "primary": it drives the tour reel + the meta.persona the
  // site and Vera read; every selected persona is tagged at completion.
  const [personas, setPersonas] = useState<PersonaId[]>(() => (isPersonaId(initialPersona) ? [initialPersona] : []))
  const primaryPersona: PersonaId = personas[0] ?? DEFAULT_PERSONA
  const reel = getPersona(primaryPersona).reel
  function togglePersona(id: PersonaId) {
    setPersonas((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
    setReelIndex(0)
  }

  // Remember which audience sequence this is, so completion can tag the cohort —
  // survives the deferred sign-in round-trip (a 30-day cookie). Preview never tags.
  useEffect(() => {
    if (preview || !sequence) return
    document.cookie = `fq_beta_seq=${encodeURIComponent(sequence)}; path=/; max-age=2592000; samesite=lax`
  }, [preview, sequence])

  // Persist the chosen personas across the deferred sign-in round-trip (30-day cookies),
  // so completion can stamp meta.persona (primary) + every persona tag. Preview never writes.
  useEffect(() => {
    if (preview) return
    document.cookie = `fq_persona=${encodeURIComponent(primaryPersona)}; path=/; max-age=2592000; samesite=lax`
    document.cookie = `fq_personas=${encodeURIComponent(personas.join(','))}; path=/; max-age=2592000; samesite=lax`
  }, [preview, personas, primaryPersona])

  // Log the persona pick at SELECTION time (owner directive), so intent is captured server-side even if
  // this (often anonymous) visitor never finishes. Debounced ~600ms so rapid multi-select toggles collapse
  // into one write; best-effort + fire-and-forget so it never blocks the UI. Skips preview and the empty
  // pre-pick state; the first real toggle from the General funnel's picker is the first thing logged.
  const personaLogPrimed = useRef(false)
  useEffect(() => {
    if (preview) return
    if (!personaLogPrimed.current) {
      personaLogPrimed.current = true
      return
    }
    if (personas.length === 0) return
    const t = setTimeout(() => {
      logPersonaSelection({ persona: primaryPersona, personas, sequence }).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [preview, personas, primaryPersona, sequence])

  const [beat, setBeat] = useState(() => Math.min(Math.max(initialBeat, 0), BEAT_COUNT - 1))
  const [previewDone, setPreviewDone] = useState(false)
  // Move focus to the top of each beat as it mounts so keyboard + screen-reader
  // users land on the new content rather than being stranded where the old
  // button was. Skipped on the very first paint (the page already has focus).
  const stageRef = useRef<HTMLDivElement>(null)
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    // preventScroll: a plain focus() runs scrollIntoView, which — inside the editor's scaled/clipped
    // preview — yanks the whole page up and hides the CTA under the header. In preview we skip the
    // focus move entirely (the flow is inert there); in the real flow we keep focus but never scroll.
    if (!preview) stageRef.current?.focus({ preventScroll: true })
  }, [beat, preview])

  // Oath
  const [oaths, setOaths] = useState<Record<OathId, boolean>>({ unfinished: false, report: false, build: false })
  const [accepting, setAccepting] = useState(false)
  const allOathsChecked = BETA_OATHS.every((o) => oaths[o.id])

  // Identity
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [check, setCheck] = useState<{ handle: string; result: 'available' | 'taken' | 'idle' } | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Place (free city search via Photon)
  const [locQuery, setLocQuery] = useState('')
  const [location, setLocation] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locResults, setLocResults] = useState<PlaceSuggestion[]>([])
  const [locOpen, setLocOpen] = useState(false)

  // Reel
  const [reelIndex, setReelIndex] = useState(0)
  // Niche Beat 2: which core feature is selected (defaults to the first); its art fills the mockup.
  const [coreIndex, setCoreIndex] = useState(0)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Deferred (signed-out) final step: collect sign-in, stash answers, then auth.
  const [email, setEmail] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Park every collected answer where it survives the auth round-trip: the text in
  // a server cookie, the avatar (too big for a cookie) in localStorage. /complete
  // reads both after sign-in and writes the profile.
  async function persistForAuth() {
    await stashPendingInduction({
      displayName: displayName.trim(),
      handle,
      bio: '',
      location,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      intent: '',
      interests: '',
      heardAbout: '',
      oaths: BETA_OATHS.filter((o) => oaths[o.id]).map((o) => o.id),
    })
    if (avatarFile) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.onerror = reject
          r.readAsDataURL(avatarFile)
        })
        localStorage.setItem(PENDING_AVATAR_KEY, dataUrl)
      } catch {
        // Avatar is best-effort: if it won't fit, they add a photo later.
      }
    }
  }

  // The deferred flow signs in, then /onboarding/beta/complete writes the profile and
  // redirects. A NICHE funnel carries its destination through the round-trip as a `?to=`
  // query on that `next` path; the finalizer re-validates it server-side before redirecting,
  // so an unsafe / absent url falls closed to the default. Waitlist / General = the bare path.
  const completeNext =
    destination?.mode === 'direct' && isSafeInAppPath(destination.url)
      ? `/onboarding/beta/complete?to=${encodeURIComponent(destination.url)}`
      : '/onboarding/beta/complete'

  async function deferredMagicLink() {
    if (!email.trim() || signingIn) return
    setSigningIn(true)
    await persistForAuth()
    const fd = new FormData()
    fd.set('email', email.trim())
    fd.set('next', completeNext)
    await signInWithMagicLink(fd) // redirects to /sign-in/confirm
  }

  async function deferredGoogle() {
    if (signingIn) return
    setSigningIn(true)
    await persistForAuth()
    const fd = new FormData()
    fd.set('next', completeNext)
    await signInWithGoogle(fd) // redirects to the provider
  }

  // Debounced handle uniqueness check.
  useEffect(() => {
    if (preview) return
    const valid = handle.length >= 3 && HANDLE_RE.test(handle)
    if (!valid || handle === initialHandle) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(userId)}`)
        const { available } = (await res.json()) as { available: boolean }
        if (!cancelled) setCheck({ handle, result: available ? 'available' : 'taken' })
      } catch {
        if (!cancelled) setCheck({ handle, result: 'idle' })
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [handle, initialHandle, userId, preview])

  // City autocomplete (Photon / OpenStreetMap — no prepopulated list, runs in the
  // browser, same source as the Circles page).
  useEffect(() => {
    const term = locQuery.trim()
    if (term === location) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setLocResults([])
        return
      }
      const r = await searchPlaces(term, ctrl.signal)
      setLocResults(r)
      setLocOpen(true)
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [locQuery, location])

  // Auto-advance the reel one slide at a time; settle on the last (no loop). Niche funnels
  // replace the reel with the pick-3 core cards, so there's nothing to auto-play there.
  useEffect(() => {
    if (beat !== 2 || hasCoreFeatures || reelIndex >= reel.length - 1) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => setReelIndex((i) => Math.min(i + 1, reel.length - 1)), 3800)
    return () => clearTimeout(t)
  }, [beat, reelIndex, reel.length, hasCoreFeatures])

  const formatOk = handle.length >= 3 && HANDLE_RE.test(handle)
  const handleStatus: HandleStatus = !formatOk
    ? 'idle'
    : preview || handle === initialHandle
    ? 'available'
    : check && check.handle === handle
    ? check.result
    : 'checking'
  const identityValid = displayName.trim().length > 0 && formatOk && handleStatus === 'available'

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setAvatarUrl('')
    // Downscale + compress on pick so EVERY downstream path uses a small image: the
    // signed-out flow parks it in localStorage across the magic-link hop (a raw photo's
    // base64 overflows the ~5MB quota and was silently dropped), and the immediate
    // upload is faster. Best-effort: falls back to the original file on any failure.
    const compressed = await downscaleImageFile(file)
    setAvatarFile(compressed)
    setAvatarPreview(URL.createObjectURL(compressed))
  }

  async function uploadAvatar(): Promise<string> {
    if (!avatarFile) return ''
    setUploading(true)
    setUploadError('')
    // Upload through the SERVER action (service-role write), not the browser Supabase
    // client: under SSR-cookie auth the browser client often has no session, so a
    // direct storage.upload() runs as `anon` and fails the owner-INSERT RLS policy —
    // the avatar silently never lands and the profile keeps a null avatar_url. The
    // server action resolves the auth user from the verified session, so it authorizes.
    try {
      const fd = new FormData()
      fd.append('file', avatarFile, avatarFile.name || 'avatar.jpg')
      fd.append('kind', 'avatar')
      const url = await uploadProfileImageAction(fd)
      setAvatarUrl(url)
      return url
    } catch {
      setUploadError('Upload failed. You can add a photo later from your profile.')
      return ''
    } finally {
      setUploading(false)
    }
  }

  async function passOath() {
    setAccepting(true)
    const accepted = BETA_OATHS.filter((o) => oaths[o.id]).map((o) => o.id)
    // No auth yet in preview/deferred — the oath rides along to the final write.
    if (!preview && !deferred) {
      try {
        await acceptBetaOath(accepted)
      } catch {
        // Non-fatal: completion re-affirms the oath.
      }
    }
    setAccepting(false)
    setBeat(1)
  }

  async function advanceFromIdentity() {
    // Deferred can't upload yet (no auth); the avatar is parked at the final step.
    if (!preview && !deferred && avatarFile && !avatarUrl) await uploadAvatar()
    setBeat(4)
  }

  async function submit() {
    if (preview) {
      setPreviewDone(true)
      return
    }
    setSubmitting(true)
    setSubmitError('')
    let finalAvatarUrl = avatarUrl
    if (avatarFile && !avatarUrl) finalAvatarUrl = await uploadAvatar()
    const accepted = BETA_OATHS.filter((o) => oaths[o.id]).map((o) => o.id)
    try {
      await completeBetaInduction(
        {
          displayName: displayName.trim(),
          handle,
          bio: '',
          avatarUrl: finalAvatarUrl,
          location,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          intent: '',
          interests: '',
          heardAbout: '',
          oaths: accepted,
        },
        // NICHE funnels admit to a niche section; the action re-validates it server-side and
        // falls closed to the default Vera welcome. Absent = the General funnel's default.
        destination,
      )
      // Redirects on success (the funnel destination, else /feed?welcome=vera); stops here.
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  // Resolve a core feature's art (Beat 2, niche funnel). A `render` reuses the induction's product
  // mockups (feed / circles / events / booking / checkin / donate / tickets / crm); an `image`
  // renders directly. FAIL-SAFE: an unknown render key stored in the DB (e.g. one from a newer build)
  // falls back to the events mockup rather than mounting an undefined component and crashing the flow.
  function renderCoreArt(art: FunnelCoreFeature['art'], active: boolean) {
    if (art.kind === 'image') {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={art.src} alt="" className="h-full w-full rounded-2xl border border-border object-cover" />
    }
    const C = RENDERS[art.render] ?? EventsRender
    return <C animate={active} />
  }

  function renderAvatar() {
    if (avatarPreview) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={avatarPreview} alt="Avatar preview" className="h-24 w-24 rounded-full object-cover shrink-0 ring-2 ring-primary" />
    }
    const initials = getInitials(displayName || userEmail)
    return (
      <div className="h-24 w-24 rounded-full bg-primary-bg text-3xl text-primary-strong font-semibold flex items-center justify-center shrink-0">
        {initials || '?'}
      </div>
    )
  }

  // ── Styles (warm light throughout) ───────────────────────────────────────────
  const inputInset =
    'w-full rounded-xl border border-border bg-canvas px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus-visible:shadow-none'
  const fieldLabel = 'mb-1.5 block text-left text-xs font-semibold uppercase tracking-wider text-subtle'
  const backLink = 'text-sm font-medium text-subtle underline-offset-4 transition-colors hover:text-muted hover:underline'
  // Primary action — the shared Wizard button (app register), used across the beats.
  const btnPrimary = wizardPrimaryClass
  const eyebrow = 'text-sm font-semibold uppercase tracking-[0.25em] text-primary'
  const heading = 'font-display uppercase leading-[1.0] text-text'

  const slide = reel[reelIndex]
  const isLastSlide = reelIndex >= reel.length - 1

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas">

      {/* Preview-only badge (subtle; public /preview route; ADR-068). */}
      {preview && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
          <span className="rounded-full bg-black/5 px-3 py-1 text-2xs font-medium text-subtle backdrop-blur-sm">
            Preview · nothing is saved
          </span>
        </div>
      )}

      {/* Preview end-state. */}
      {preview && previewDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-bg text-2xl text-primary-strong">✓</div>
            <h2 className="mt-4 text-xl font-bold text-text">Welcome in.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              In the real induction this writes your profile and drops you into the feed to make your
              first post. Here it just stops, nothing was saved.
            </p>
            <button
              onClick={() => {
                setPreviewDone(false)
                setBeat(0)
                setReelIndex(0)
                setOaths({ unfinished: false, report: false, build: false })
              }}
              className="mt-5 w-full rounded-full border border-border px-6 py-3 text-sm font-semibold text-muted transition-colors hover:text-text"
            >
              Run it again
            </button>
          </div>
        </div>
      )}

      {/* Stage: one centered column — logo, content, progress — with tight, consistent gaps. */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="flex shrink-0 flex-col items-center">
          <span className="animate-wiggle inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-[0.35em] text-on-primary shadow-sm shadow-primary/25">
            Welcome
          </span>
          <span className="brandmark-link mt-5 block">
            <span className="brandmark h-12 aspect-[963/170] sm:h-[52px]" aria-hidden />
          </span>

          {/* Scanned in via a member's QR code → a warm "Invited by {name}" chip with
              their photo, so the welcome reads personal from the first beat. */}
          {inviter && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-3.5 shadow-sm">
              {inviter.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inviter.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong" aria-hidden>
                  {getInitials(inviter.displayName) || '?'}
                </span>
              )}
              <span className="text-sm text-muted">
                Invited by <span className="font-semibold text-text">{inviter.displayName}</span>
              </span>
            </div>
          )}
        </div>

        <div
          key={beat}
          ref={stageRef}
          tabIndex={-1}
          role="group"
          aria-label={`Step ${beat + 1} of ${BEAT_COUNT}: ${BEAT_LABELS[beat]}`}
          className="mt-10 w-full animate-[slideUp_0.5s_ease-out] text-center outline-none"
        >
            {/* ── Beat 0: The Beta Promise ── */}
            {beat === 0 && (
              <div className="mx-auto max-w-5xl">
                <p className={eyebrow}>{VERA.oath.eyebrow}</p>
                <h1 className={`mx-auto mt-3 max-w-4xl text-balance text-6xl sm:text-7xl ${heading}`}>
                  {accent(VERA.oath.heading)}
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{VERA.oath.body}</p>

                {/* Agreements + I'm in, in a 2×2 grid (two rows). */}
                <div className="mx-auto mt-7 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  {BETA_OATHS.map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${oaths[o.id] ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary/40'}`}
                    >
                      <input
                        type="checkbox"
                        checked={oaths[o.id]}
                        onChange={(e) => setOaths((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                        className="h-5 w-5 shrink-0 accent-primary"
                      />
                      <span className={`text-base font-medium ${oaths[o.id] ? 'text-text' : 'text-muted'}`}>{o.label}</span>
                    </label>
                  ))}
                  <button disabled={!allOathsChecked || accepting} onClick={passOath} className={`${btnPrimary} h-full`}>
                    {accepting ? 'One sec…' : VERA.oath.cta}
                    {!accepting && <ArrowRight />}
                  </button>
                </div>
              </div>
            )}

            {/* ── Beat 1: Intro ── */}
            {beat === 1 && (
              <div className="mx-auto max-w-4xl">
                <p className={eyebrow}>{VERA.intro.eyebrow}</p>
                <h1 className={`mx-auto mt-3 max-w-3xl text-balance text-6xl sm:text-7xl ${heading}`}>
                  {accent(VERA.intro.heading)}
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-xl leading-relaxed text-muted">{VERA.intro.body}</p>

                {/* Beat-1 fork. NICHE funnel: 4 informational "what are you into" cards tuned to
                    the niche, in place of the persona picker (the reel is replaced on Beat 2 too,
                    so the persona stays the default — persona tagging is untouched for the General
                    funnel). GENERAL funnel: the multi-select persona fork, exactly as before. */}
                {hasNicheFeatures ? (
                  <>
                    <p className="mt-9 text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">First off, what are you into?</p>
                    <div className="mx-auto mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
                      {slide2Features!.map((f, i) => {
                        const Icon = funnelIcon(f.icon)
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-left"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong" aria-hidden>
                              <Icon className="h-5 w-5" />
                            </span>
                            <span>
                              <span className="block text-base font-bold text-text">{f.title}</span>
                              <span className="mt-0.5 block text-sm text-muted">{f.blurb}</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Persona fork — first, who are you? Pre-selected if they came in
                        through a lead flow; changeable here. Branches the tour reel and
                        is stamped on the member so the site + Vera can tailor later. */}
                    <p className="mt-9 text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">First, who are you?</p>
                    <p className="mt-1.5 text-sm text-muted">Pick all that fit.</p>
                    <div className="mx-auto mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
                      {listPersonas().map((p) => {
                        const active = personas.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePersona(p.id)}
                            aria-pressed={active}
                            className={`relative flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary/40'}`}
                          >
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-primary text-on-primary' : 'bg-primary-bg text-primary-strong'}`} aria-hidden>
                              <p.Icon className="h-5 w-5" />
                            </span>
                            <span>
                              <span className="block text-base font-bold text-text">{p.label}</span>
                              <span className="mt-0.5 block text-sm text-muted">{p.pitch}</span>
                            </span>
                            {/* Multi-select checkmark — reads clearly as "more than one is fine". */}
                            {active && (
                              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden>
                                <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 10l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                <div className="mt-8 flex flex-col items-center gap-3">
                  <button onClick={() => setBeat(2)} className={btnPrimary}>{VERA.intro.cta}<ArrowRight /></button>
                  <button onClick={() => setBeat(0)} className={backLink}>Back</button>
                </div>
              </div>
            )}

            {/* ── Beat 2: The reel (desktop website mockup) ── */}
            {beat === 2 && (
              <div className="mx-auto max-w-5xl">
                <p className={eyebrow}>{VERA.tour.eyebrow}</p>
                <h1 className={`mt-3 text-balance text-4xl sm:text-5xl ${heading}`}>{accent(VERA.tour.heading)}</h1>

                {/* Beat-2 fork. NICHE funnel: pick one of 3 core features; the mockup shows the
                    SELECTED card's art. GENERAL funnel: the auto-playing tour reel, unchanged. */}
                {hasCoreFeatures ? (
                  <div className="mt-6 flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-12">
                    {/* mockup shows the selected core feature's art, left */}
                    <div className="relative w-full max-w-xl shrink-0" style={{ aspectRatio: '540 / 348' }}>
                      {slide3Core!.map((c, i) => {
                        const active = i === coreIndex
                        return (
                          <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            {renderCoreArt(c.art, active)}
                          </div>
                        )
                      })}
                    </div>

                    {/* selectable core-feature cards + action, right */}
                    <div className="w-full max-w-xs text-left">
                      <div className="flex flex-col gap-3">
                        {slide3Core!.map((c, i) => {
                          const active = i === coreIndex
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setCoreIndex(i)}
                              aria-pressed={active}
                              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary/40'}`}
                            >
                              <span className="block text-base font-bold text-text">{c.title}</span>
                              <span className="mt-0.5 block text-sm text-muted">{c.blurb}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-7 flex flex-col items-center gap-3 md:items-start">
                        <button onClick={() => setBeat(3)} className={btnPrimary}>{VERA.tour.cta}<ArrowRight /></button>
                        <button onClick={() => setBeat(1)} className={backLink}>Back</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-12">
                    {/* desktop mockup, left */}
                    <div className="relative w-full max-w-xl shrink-0" style={{ aspectRatio: '540 / 348' }}>
                      {reel.map((s, i) => {
                        const active = i === reelIndex
                        const C = s.kind === 'render' ? RENDERS[s.render] : null
                        return (
                          <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            {C && <C animate={active} />}
                          </div>
                        )
                      })}
                    </div>

                    {/* caption + dots + action, right */}
                    <div className="max-w-xs text-center md:text-left">
                      <p className="text-3xl font-bold text-text">{slide.title}</p>
                      <p className="mt-2 text-lg leading-relaxed text-muted">{slide.line}</p>
                      <div className="mt-5 flex items-center justify-center gap-2 md:justify-start">
                        {reel.map((s, i) => (
                          <button
                            key={i}
                            aria-label={`Show ${s.title}`}
                            onClick={() => setReelIndex(i)}
                            className={`h-2 rounded-full transition-all ${i === reelIndex ? 'w-6 bg-primary' : 'w-2 bg-border-strong hover:bg-primary/60'}`}
                          />
                        ))}
                      </div>
                      <div className="mt-7 flex flex-col items-center gap-3 md:items-start">
                        <button onClick={() => (isLastSlide ? setBeat(3) : setReelIndex(reelIndex + 1))} className={btnPrimary}>
                          {isLastSlide ? VERA.tour.cta : 'Next'}
                          <ArrowRight />
                        </button>
                        <button onClick={() => setBeat(1)} className={backLink}>Back</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Beat 3: Identity ── */}
            {beat === 3 && (
              <div className="mx-auto max-w-4xl">
                <h1 className={`text-balance text-5xl sm:text-6xl ${heading}`}>{accent(VERA.identity.heading)}</h1>

                <div className="mt-7 flex flex-col items-center gap-8 text-left md:flex-row md:items-center md:justify-center md:gap-10">
                  {/* left: form card */}
                  <div className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
                    <div>
                      <label htmlFor="induction-name" className={fieldLabel}>Display name</label>
                      <input
                        id="induction-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          const v = e.target.value
                          setDisplayName(v)
                          if (!handleTouched) setHandle(suggestHandle(v))
                        }}
                        placeholder="Your name"
                        // Not in preview: autoFocus runs scrollIntoView, which inside the editor's
                        // scaled preview scrolls the page and hides the buttons under the header.
                        autoFocus={!preview}
                        className={inputInset}
                      />
                    </div>
                    <div>
                      <label htmlFor="induction-handle" className={fieldLabel}>Handle</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-subtle" aria-hidden>@</span>
                        <input
                          id="induction-handle"
                          type="text"
                          value={handle}
                          onChange={(e) => {
                            setHandleTouched(true)
                            setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                          }}
                          placeholder="yourname"
                          aria-invalid={handleStatus === 'taken'}
                          aria-describedby="induction-handle-status"
                          className={`${inputInset} pl-9 pr-9`}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm leading-none" aria-hidden>
                          {handleStatus === 'checking' && <span className="animate-pulse text-subtle">•••</span>}
                          {handleStatus === 'available' && <span className="text-success">✓</span>}
                          {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                        </span>
                      </div>
                      {/* Live status — read by assistive tech as availability resolves. */}
                      <p id="induction-handle-status" role="status" aria-live="polite" className={handleStatus === 'taken' ? 'mt-1.5 text-left text-xs text-danger' : 'sr-only'}>
                        {handleStatus === 'checking'
                          ? 'Checking availability…'
                          : handleStatus === 'available'
                          ? 'Handle is available.'
                          : handleStatus === 'taken'
                          ? 'That handle is already taken.'
                          : ''}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="induction-city" className={fieldLabel}>Your city</label>
                      <div className="relative">
                        <input
                          id="induction-city"
                          type="text"
                          role="combobox"
                          aria-expanded={locOpen && locResults.length > 0}
                          aria-controls="induction-city-list"
                          aria-autocomplete="list"
                          value={locQuery}
                          onChange={(e) => {
                            setLocQuery(e.target.value)
                            setLocation('')
                            setCoords(null)
                            setLocOpen(true)
                          }}
                          onFocus={() => locResults.length > 0 && setLocOpen(true)}
                          onBlur={() => setTimeout(() => setLocOpen(false), 150)}
                          placeholder="Start typing your city…"
                          className={inputInset}
                          autoComplete="off"
                        />
                        {location && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-success" aria-hidden>✓</span>}
                        {locOpen && locResults.length > 0 && (
                          <ul id="induction-city-list" role="listbox" aria-label="City suggestions" className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
                            {locResults.map((r) => (
                              <li key={`${r.label}-${r.lat}`} role="option" aria-selected={location === r.label}>
                                <button
                                  type="button"
                                  onMouseDown={() => {
                                    setLocation(r.label)
                                    setLocQuery(r.label)
                                    setCoords({ lat: r.lat, lng: r.lng })
                                    setLocOpen(false)
                                  }}
                                  className="block w-full px-4 py-2.5 text-left text-base text-text transition-colors hover:bg-primary-bg"
                                >
                                  {r.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* right: avatar over the copy, button under */}
                  <div className="flex w-full max-w-xs flex-col items-center gap-4 text-center md:items-start md:text-left">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="group">
                      <div className="rounded-full ring-4 ring-surface shadow-sm">{renderAvatar()}</div>
                      <span className="mt-2 block text-center text-xs font-semibold text-primary group-hover:underline">
                        {avatarPreview ? 'Change photo' : 'Add a photo'}
                      </span>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
                    <p className="text-lg leading-relaxed text-muted">{VERA.identity.body}</p>
                    <div className="mt-2 flex flex-col items-center gap-3 md:items-start">
                      <button disabled={!identityValid || uploading} onClick={advanceFromIdentity} className={btnPrimary}>
                        {uploading ? 'Uploading…' : 'Continue'}{!uploading && <ArrowRight />}
                      </button>
                      <button onClick={() => setBeat(2)} className={backLink}>Back</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Beat 4: Enter (profile card left, copy right) ── */}
            {beat === 4 && !deferred && (
              <div className="mx-auto max-w-4xl">
                <p className={eyebrow}>{VERA.enter.eyebrow}</p>
                <h1 className={`mt-3 text-balance text-5xl sm:text-6xl ${heading}`}>{accent(VERA.enter.heading)}</h1>

                <div className="mt-7 flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-10">
                  {/* portrait profile card with blank slots */}
                  <div className="w-full max-w-72 shrink-0 rounded-3xl border border-border bg-surface p-7 text-center shadow-sm">
                    <div className="mx-auto w-fit rounded-full ring-4 ring-surface">{renderAvatar()}</div>
                    <p className="mt-4 text-xl font-semibold text-text">{displayName || <span className="text-subtle">Your name</span>}</p>
                    <p className="text-sm text-muted">@{handle || 'handle'}</p>
                    <div className="mt-4 space-y-2 border-t border-border pt-4 text-left text-sm">
                      <p className="text-text">{location || <span className="italic text-subtle">Add your city</span>}</p>
                    </div>
                  </div>

                  {/* copy + button under it, right */}
                  <div className="w-full max-w-xs text-center md:text-left">
                    <p className="text-lg leading-relaxed text-muted">{VERA.enter.body}</p>
                    {submitError && <p className="mt-3 text-sm text-danger">{submitError}</p>}
                    <div className="mt-6 flex flex-col items-center gap-3 md:items-start">
                      <button onClick={submit} disabled={submitting} className={btnPrimary}>
                        {submitting ? 'Stepping in…' : VERA.enter.cta}{!submitting && <ArrowRight />}
                      </button>
                      <button onClick={() => setBeat(3)} className={backLink}>Back</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Beat 4 (deferred): the final step IS creating the account ── */}
            {beat === 4 && deferred && (
              <div className="mx-auto max-w-4xl">
                <p className={eyebrow}>{VERA.enter.eyebrow}</p>
                <h1 className={`mt-3 text-balance text-5xl sm:text-6xl ${heading}`}>{accent(VERA.enter.heading)}</h1>

                <div className="mt-7 flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-10">
                  {/* portrait profile card — everything they just built */}
                  <div className="w-full max-w-72 shrink-0 rounded-3xl border border-border bg-surface p-7 text-center shadow-sm">
                    <div className="mx-auto w-fit rounded-full ring-4 ring-surface">{renderAvatar()}</div>
                    <p className="mt-4 text-xl font-semibold text-text">{displayName || <span className="text-subtle">Your name</span>}</p>
                    <p className="text-sm text-muted">@{handle || 'handle'}</p>
                    <div className="mt-4 space-y-2 border-t border-border pt-4 text-left text-sm">
                      <p className="text-text">{location || <span className="italic text-subtle">Add your city</span>}</p>
                    </div>
                  </div>

                  {/* lock it in: sign in to save, then straight to the feed */}
                  <div className="w-full max-w-xs text-left">
                    <p className="text-lg leading-relaxed text-muted">
                      You’re almost in. Sign in and everything you just set up is saved.
                    </p>

                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') deferredMagicLink() }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      aria-label="Email address"
                      className={`${inputInset} mt-4`}
                    />
                    <button
                      onClick={deferredMagicLink}
                      disabled={!email.trim() || signingIn}
                      className={`${btnPrimary} mt-3 w-full`}
                    >
                      {signingIn ? 'One sec…' : 'Step in'}{!signingIn && <ArrowRight />}
                    </button>

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-canvas px-2 text-subtle">or</span></div>
                    </div>

                    <button
                      onClick={deferredGoogle}
                      disabled={signingIn}
                      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-base font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Continue with Google
                    </button>

                    <button onClick={() => setBeat(3)} className={`${backLink} mt-4 block`}>Back</button>
                    <p className="mt-4 text-xs text-subtle">Free to join. No card. Leave anytime.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        {/* Progress — tight under the content, the shared staged-flow cue. */}
        <div className="mt-9 w-full max-w-sm shrink-0">
          <WizardProgress current={beat + 1} total={BEAT_COUNT} label={BEAT_LABELS[beat]} />
        </div>

        {/* A quiet way out on every step — never trap anyone, but keep focus on
            the onboarding (small + low-contrast). */}
        <p className="mt-6 shrink-0 text-center text-xs text-subtle/70">
          <Link href="/" className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Home
          </Link>
          <span className="px-1.5 text-border" aria-hidden>|</span>
          <Link href="/sign-in" className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Log in to account
          </Link>
        </p>
      </div>
    </main>
  )
}
