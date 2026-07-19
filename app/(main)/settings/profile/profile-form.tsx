'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { Check, Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { updateProfile, setSpotlightPublished, setMySpotlightEnabled, setProfileHeaderFocus, setProfileAvatarFocus } from './actions'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'
import { HeaderImageField } from '@/components/ui/header-image-field'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import { heroAspect } from '@/lib/spaces/hero-config'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

const HANDLE_RE = /^[a-z0-9_]+$/

const input = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30 disabled:opacity-50'
const lbl   = 'block text-sm font-medium text-text mb-1'

export function ProfileForm({
  userId,
  initial,
  hideSpotlight = false,
}: {
  userId: string
  /** Suppress the big Spotlight block (ADR-515 Phase 2): the rail mounts ProfileForm with this on,
   *  because the condensed `account.spotlight` section represents Spotlight there; the full
   *  /settings/profile page keeps the block (default off). */
  hideSpotlight?: boolean
  initial: {
    displayName: string
    handle: string
    bio: string
    avatarUrl: string
    /** The saved avatar FOCAL POINT (CSS object-position "x% y%"). Defaults to centered. */
    avatarFocal: string
    headerImageUrl: string
    /** The saved header banner FOCAL POINT (CSS object-position "x% y%"). Defaults to centered. */
    headerFocal: string
    email: string
    phone: string
    city: string
    website: string
    spotlightEnabled: boolean
    spotlightPublished: boolean
    /** Crew+ self-serve: may this member turn their own Spotlight on? (ADR-431) */
    canEnableSpotlight: boolean
    profileTheme: string | null
  }
}) {
  const [displayName,   setDisplayName]   = useState(initial.displayName)
  const [handle,        setHandle]        = useState(initial.handle)
  const [handleTouched, setHandleTouched] = useState(false)
  const [handleCheck,   setHandleCheck]   = useState<{ handle: string; status: 'available' | 'taken' | 'idle' } | null>(null)
  const [bio,           setBio]           = useState(initial.bio)
  const [phone,         setPhone]         = useState(initial.phone)
  const [city,          setCity]          = useState(initial.city)
  // City picks also propagate the member's home location (powers "near you").
  const [home,          setHome]          = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [website,       setWebsite]       = useState(initial.website)
  const [avatarUrl,     setAvatarUrl]     = useState(initial.avatarUrl)
  // Avatar FOCUS — where the photo sits in its round crop. The SAME drag-to-focus control the header uses,
  // on the existing photo too; debounced to profiles.meta.avatarFocal and applied at render (ProfileAvatar).
  const [avatarFocus,   setAvatarFocus]   = useState(initial.avatarFocal || DEFAULT_OBJECT_POSITION)
  const avatarFocusTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [headerUrl,     setHeaderUrl]     = useState(initial.headerImageUrl)
  // Header FOCUS — where the header banner sits in its cropped hero window (a CSS object-position).
  // The SAME reusable control the Space + event rails use (ImageFocalPicker): the marker moves live
  // while a drag DEBOUNCES the write via the dedicated setProfileHeaderFocus action (so a drag does
  // not fire a save per pixel). This is a reposition only; it never changes the header's height. The
  // value is also included in the main Save (updateProfile) so a Save before the debounce fires still
  // persists it.
  const [headerFocus,   setHeaderFocus]   = useState(initial.headerFocal || DEFAULT_OBJECT_POSITION)
  const focusTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [spotEnabled,   setSpotEnabled]   = useState(initial.spotlightEnabled)
  const [spotPublished, setSpotPublished] = useState(initial.spotlightPublished)
  const [spotPending,   setSpotPending]   = useState(false)
  const [spotError,     setSpotError]     = useState('')
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [isPending,     startTransition]  = useTransition()

  // Handle status is derived during render — the only thing that genuinely needs
  // an effect is the async uniqueness check, whose result we store tagged with
  // the handle it applies to so a stale response can't be shown against newer
  // input. (Deriving here instead of setting state in the effect avoids the
  // cascading re-renders that react-hooks/set-state-in-effect warns about.)
  const handleNeedsCheck =
    handleTouched &&
    handle !== initial.handle &&
    handle.length >= 3 &&
    HANDLE_RE.test(handle)

  let handleStatus: HandleStatus
  if (!handleTouched || handle === initial.handle) {
    handleStatus = 'available'      // own handle / untouched is always fine
  } else if (!handleNeedsCheck) {
    handleStatus = 'idle'           // too short or invalid characters
  } else if (handleCheck?.handle === handle) {
    handleStatus = handleCheck.status
  } else {
    handleStatus = 'checking'       // debouncing or awaiting the network result
  }

  useEffect(() => {
    if (!handleNeedsCheck) return
    if (handleCheck?.handle === handle) return // already resolved for this value
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(userId)}`
        )
        const { available } = (await res.json()) as { available: boolean }
        setHandleCheck({ handle, status: available ? 'available' : 'taken' })
      } catch {
        setHandleCheck({ handle, status: 'idle' })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [handle, handleNeedsCheck, handleCheck, userId])

  // Debounced live save of the avatar focal point (400ms), mirroring the header one. The marker moves
  // instantly; the write lands once the drag settles, and the value also rides the main Save.
  function onAvatarFocusChange(next: string) {
    setAvatarFocus(next)
    if (avatarFocusTimer.current) clearTimeout(avatarFocusTimer.current)
    avatarFocusTimer.current = setTimeout(() => {
      void setProfileAvatarFocus(next).catch(() => {
        /* a transient focal save failure is non-blocking; the value still rides the main Save */
      })
    }, 400)
  }

  // Debounced live save of the header focal point (400ms, matching the Space form). The picker updates
  // the marker instantly; the write lands once the drag settles.
  function onHeaderFocusChange(next: string) {
    setHeaderFocus(next)
    if (focusTimer.current) clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(() => {
      void setProfileHeaderFocus(next).catch(() => {
        /* a transient focal save failure is non-blocking; the value still rides the main Save */
      })
    }, 400)
  }

  const canSave =
    displayName.trim().length > 0 &&
    handle.length >= 3 &&
    HANDLE_RE.test(handle) &&
    handleStatus !== 'taken' &&
    handleStatus !== 'checking' &&
    !isPending

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaved(false)

    // Avatar + header images are set directly by the shared fields (via the Loom picker, which returns a
    // public URL) or cleared to '', so their state is already the value to persist.
    startTransition(async () => {
      try {
        await updateProfile({
          displayName:    displayName.trim(),
          handle:         handle.trim(),
          bio:            bio.trim(),
          avatarUrl:      avatarUrl,
          avatarFocal:    avatarFocus,
          headerImageUrl: headerUrl,
          headerFocal:    headerFocus,
          phone:          phone.trim(),
          city:           city.trim(),
          website:        website.trim(),
          home,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  async function handleTogglePublish() {
    const next = !spotPublished
    setSpotPending(true)
    setSpotError('')
    try {
      await setSpotlightPublished(next)
      setSpotPublished(next)
    } catch (err) {
      setSpotError(err instanceof Error ? err.message : 'Could not update your Spotlight.')
    } finally {
      setSpotPending(false)
    }
  }

  async function handleToggleEnable(next: boolean) {
    setSpotPending(true)
    setSpotError('')
    try {
      await setMySpotlightEnabled(next)
      setSpotEnabled(next)
      if (!next) setSpotPublished(false) // disabling also unpublishes (server does the same)
    } catch (err) {
      setSpotError(err instanceof Error ? err.message : 'Could not update your Spotlight.')
    } finally {
      setSpotPending(false)
    }
  }

  const spotlightUrl = handle ? `/spotlight/${handle}` : ''

  return (
    <form onSubmit={handleSave} className="space-y-6">

      {/* ── Header / cover image — the ONE shared header control (upload/browse via the Loom picker,
          with the same drag-to-focus preview every header uses). Scoped to your own uploads. ──────── */}
      <div>
        <label className={lbl}>Header image</label>
        <HeaderImageField
          value={headerUrl || null}
          onChange={(url) => setHeaderUrl(url ?? '')}
          focus={headerFocus}
          onFocusChange={onHeaderFocusChange}
          aspect={heroAspect('standard')}
          scopeKey="mine"
          disabled={isPending}
          hint="Wide banner across the top of your profile."
          focusHint="Drag to choose which part of your header photo stays in frame."
        />
      </div>

      {/* ── Photo (avatar) — the SAME shared image control as the header: browse/upload via the full-screen
          Loom picker (scoped to your uploads), with the same drag-to-focus selector on a round crop so you
          can reframe an existing photo too. ──────── */}
      <div>
        <label className={lbl}>Photo</label>
        <HeaderImageField
          value={avatarUrl || null}
          onChange={(url) => setAvatarUrl(url ?? '')}
          focus={avatarFocus}
          onFocusChange={onAvatarFocusChange}
          aspect={1}
          rounded
          scopeKey="mine"
          disabled={isPending}
          label="Profile photo"
          hint="A square photo reads best."
          focusHint="Drag to choose which part of your photo stays in the circle."
          className="max-w-[16rem]"
        />
      </div>

      {/* ── Display name ────────────────────────────── */}
      <div>
        <label htmlFor="displayName" className={lbl}>
          Display name <span className="text-danger">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Jane Smith"
          required
          disabled={isPending}
          className={input}
        />
      </div>

      {/* ── Handle ──────────────────────────────────── */}
      <div>
        <label htmlFor="handle" className={lbl}>
          Handle <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle select-none">@</span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={e => {
              setHandleTouched(true)
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            }}
            placeholder="jane_smith"
            required
            disabled={isPending}
            className={`${input} pl-7 pr-8`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm leading-none">
            {handleStatus === 'checking'  && <span className="text-subtle animate-pulse">•••</span>}
            {handleStatus === 'available' && <span className="text-success">✓</span>}
            {handleStatus === 'taken'     && <span className="text-danger">✗</span>}
          </span>
        </div>
        {handleStatus === 'taken' && (
          <p className="mt-1 text-xs text-danger">This handle is already taken.</p>
        )}
        {handle && !HANDLE_RE.test(handle) && (
          <p className="mt-1 text-xs text-danger">Lowercase letters, numbers, and underscores only.</p>
        )}
      </div>

      {/* ── Bio ─────────────────────────────────────── */}
      <div>
        <label htmlFor="bio" className={lbl}>
          Bio <span className="text-subtle font-normal text-xs">(optional)</span>
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 280))}
          placeholder="A bit about yourself..."
          rows={4}
          disabled={isPending}
          className={`${input} resize-none`}
        />
        <p className={`mt-1 text-xs text-right tabular-nums ${bio.length >= 260 ? 'text-primary' : 'text-subtle'}`}>
          {bio.length} / 280
        </p>
      </div>

      {/* ── Personal info / contact ─────────────────── */}
      <div className="space-y-5 rounded-2xl border border-border bg-surface-elevated/40 p-4">
        <div>
          <p className="text-sm font-semibold text-text">Personal info</p>
          <p className="mt-0.5 text-xs text-muted">
            Private to you and your community leaders. Used to keep in touch, never shown on your public profile.
          </p>
        </div>

        {/* Email — read-only (managed by your sign-in) */}
        <div>
          <label className={lbl}>Email</label>
          <input
            type="email"
            value={initial.email}
            readOnly
            disabled
            className={`${input} cursor-not-allowed text-muted`}
          />
          <p className="mt-1 text-xs text-subtle">Your sign-in email. Contact support to change it.</p>
        </div>

        <div>
          <label htmlFor="phone" className={lbl}>
            Phone <span className="text-subtle font-normal text-xs">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value.slice(0, 40))}
            placeholder="(555) 123-4567"
            disabled={isPending}
            className={input}
          />
        </div>

        <div>
          <label className={lbl}>
            City <span className="text-subtle font-normal text-xs">(optional)</span>
          </label>
          <LocationAutocomplete
            value={city}
            placeholder="Start typing your city…"
            onPick={(p) => {
              setCity(p.label.split(',')[0])
              setHome({ lat: p.lat, lng: p.lng, label: p.label })
            }}
          />
          <p className="mt-1 text-xs text-subtle">Pick from the suggestions. It also sets your location so we can surface circles and events near you.</p>
        </div>

        <div>
          <label htmlFor="website" className={lbl}>
            Website <span className="text-subtle font-normal text-xs">(optional)</span>
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value.slice(0, 200))}
            placeholder="yoursite.com"
            disabled={isPending}
            className={input}
          />
        </div>
      </div>

      {/* ── Spotlight page (opt-in public mini-site) ───────────────────────────
          Crew+ members turn it on themselves here (ADR-431); once on, the builder,
          theme, and publish controls appear. Members who can't enable it yet see
          nothing (an upgrade nudge lives on /upgrade, not here). */}
      {!hideSpotlight && !spotEnabled && initial.canEnableSpotlight && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-text">Your Spotlight page</p>
              <p className="mt-0.5 text-xs text-muted">
                Build a shareable page that&rsquo;s all yours: your bio, links, images, and what you
                host, arranged however you like. Turn it on to start; nothing goes public until you
                publish it.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleEnable(true)}
            disabled={spotPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {spotPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Turn on your Spotlight
          </button>
          {spotError && <p className="text-xs text-danger">{spotError}</p>}
        </div>
      )}

      {!hideSpotlight && spotEnabled && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-text">Your Spotlight page</p>
              <p className="mt-0.5 text-xs text-muted">
                A shareable page with your bio, links, and what you host. Themed to match your
                profile. Anyone with the link can see it once you publish.
              </p>
            </div>
          </div>

          {/* The page BUILDER lives inline in the rail on your own profile (ADR-516 Phase C; ADR-522: the
              grid is the single engine now). Open your profile and the rail's Layout section is the full
              rows/slots builder, previewing every change live. */}
          <Link
            href={`/people/${initial.handle}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Sparkles className="h-3.5 w-3.5" /> Build your page (arrange your blocks)
          </Link>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <span className="text-sm text-text">{spotPublished ? 'Published' : 'Draft (only you can see it)'}</span>
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={spotPending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                spotPublished
                  ? 'border border-border-strong text-text hover:bg-surface-elevated'
                  : 'bg-primary text-on-primary hover:bg-primary-hover'
              }`}
            >
              {spotPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {spotPublished ? 'Unpublish' : 'Publish'}
            </button>
          </div>

          {spotError && <p className="text-xs text-danger">{spotError}</p>}

          {spotPublished && spotlightUrl && (
            <Link
              href={spotlightUrl}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View your Spotlight
            </Link>
          )}

          {initial.canEnableSpotlight && (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => handleToggleEnable(false)}
                disabled={spotPending}
                className="text-xs font-medium text-subtle transition-colors hover:text-danger disabled:opacity-50"
              >
                Turn off Spotlight
              </button>
              <p className="mt-0.5 text-2xs text-muted">Hides the page and unpublishes it. Your layout is kept.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Error + Save ────────────────────────────── */}
      {saveError && (
        <p className="text-sm text-danger">{saveError}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : null}
          {isPending ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
