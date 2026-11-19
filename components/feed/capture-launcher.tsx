'use client'

import { useState, useEffect, useCallback, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { Share2, Camera, ImagePlus, Send, ChevronRight, CalendarCheck, NotebookPen, ArrowLeft, QrCode, X } from 'lucide-react'
import { observe } from '@/lib/analytics/observe'
import { useMindless } from '@/components/on-air/mindless'
import { BreatheIcon } from '@/components/on-air/icons'
import { Dialog } from '@/components/ui/dialog'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonClasses } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/field'
import { choiceTileClasses } from '@/components/ui/choice-tile'
import { createPost } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'
import { CaptureBox } from './capture-box'

type Mode = 'post' | 'note' | 'photo' | 'contact'
/** menu: the six in-person functions. held: the code held up to someone. compose: the full composer. */
type View = 'menu' | 'held' | 'compose'
type Prompt = {
  line: string | null
  liveEvent: boolean
  code: { id: string; url: string } | null
  me: { name: string; avatar: string | null } | null
}

// Capture: the app-wide primary action (ADR-155/156a). Every Zap door (header, tab bar, drawer)
// dispatches 'open-capture' and lands here; the modal is always mounted so any trigger opens it.
//
// THE ZAP MENU (LIVE-2423, the Claude Design handoff of 2026-11-18, frame 2a). A quick, in-person
// menu with six functions in four rows: your code (Share my QR, Scan a QR), a one-line post box,
// Open the timer, and two tiles (Check in, Log a practice). Tapping the code holds it up: the card
// becomes one big QR with Share and Scan under it. The full composer (photo, poll, contact card)
// is one tap away, from the photo button or an empty send. Snap a poster and Snap a card left the
// menu: they live on /events and /network/contacts.
//
// THE OVERLAY IS `Dialog align="bottom"`: a POP-UP, never a takeover. A bottom sheet on a phone (the
// page stays visible, dimmed, above it) and a centred card at sm+. The primitive owns the focus
// trap, focus restore, the portal (so the `transform`ed admin rail cannot trap it), the z-[80]
// tier above the mobile admin sheet, the bg-ink/60 scrim and the top safe area; the panel owns its
// bottom inset, because the sheet touches the bottom edge. `mt-auto` pins it there: inside the
// member kit the portaled overlay inherits `[data-kit="members"]`, whose flex column turns
// `items-end` sideways and would float a short sheet mid-screen on a phone.
export function CaptureLauncher({ scopeId }: { scopeId: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('post')
  const [view, setView] = useState<View>('menu')
  // The cheap prompt (no AI): Vera's line, a live event to check in to, the member's own code and
  // their avatar. The menu paints at once from fallbacks and fills in when it lands.
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [draft, setDraft] = useState('')
  const [posted, setPosted] = useState<string | null>(null)
  const [posting, startPost] = useTransition()
  const [shared, setShared] = useState(false)

  const mindless = useMindless()
  const close = useCallback(() => {
    setOpen(false)
    setView('menu')
  }, [])
  const tap = useCallback((tile: string) => observe('zap_menu.tile_tap', { tile }), [])

  // Mindless is the ONE timer door. Open it first (its loading takeover paints instantly), then
  // drop the pop-up so the page behind never flashes between the two.
  const openTimer = useCallback(
    (justLog: boolean) => () => {
      tap(justLog ? 'log' : 'mindless')
      mindless.open(justLog ? { justLog: true } : undefined)
      close()
    },
    [mindless, close, tap],
  )

  useEffect(() => {
    if (!open || prompt) return
    let on = true
    fetch('/api/zap-prompt')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!on || !d) return
        setPrompt({
          line: typeof d.line === 'string' ? d.line : null,
          liveEvent: d.liveEvent === true,
          code: d.code && typeof d.code.id === 'string' ? d.code : null,
          me: d.me ?? null,
        })
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [open, prompt])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const m = (e as CustomEvent).detail?.mode as Mode | undefined
      setMode(m ?? 'post')
      // A door that asks for a specific composer mode (the contact card) opens straight on it.
      setView(m && m !== 'post' ? 'compose' : 'menu')
      setPosted(null)
      setOpen(true)
      observe('zap_menu.open')
    }
    window.addEventListener('open-capture', onOpen)
    return () => window.removeEventListener('open-capture', onOpen)
  }, [])

  const compose = useCallback(
    (m: Mode) => {
      tap('composer')
      setMode(m)
      setView('compose')
    },
    [tap],
  )

  // Send with text posts in place; send while empty opens the full composer.
  const send = () => {
    const body = draft.trim()
    if (!body) return compose('post')
    startPost(async () => {
      const fd = new FormData()
      fd.set('body', body)
      fd.set('scopeId', scopeId)
      fd.set('visibility', 'public')
      fd.set('post_type', 'feed')
      const res = await createPost(fd)
      if (res && isError(res)) {
        setPosted(res.error)
        return
      }
      observe('zap_menu.tile_tap', { tile: 'post' })
      setDraft('')
      setPosted('Posted to your wall.')
    })
  }

  const code = prompt?.code ?? null
  const share = async () => {
    tap('share')
    if (!code) return
    const data = { title: 'My Frequency code', text: 'Say hi on Frequency', url: code.url }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard?.writeText(code.url)
        setShared(true)
        setTimeout(() => setShared(false), 1500)
      }
    } catch {
      // the member dismissed the share sheet
    }
  }

  const shareScan = (big: boolean) => (
    <div className="grid w-full grid-cols-2 gap-1.5">
      <Button variant="secondary" onClick={share} disabled={!code} className="min-w-0 rounded-pill bg-surface px-2 lift-1">
        <Share2 className="h-4.5 w-4.5 shrink-0" aria-hidden />
        {shared ? 'Copied' : big ? 'Share my QR' : 'Share'}
      </Button>
      <Link href="/scan" onClick={() => { tap('scan'); close() }} className={buttonClasses('secondary', 'md', 'min-w-0 rounded-pill bg-surface px-2 lift-1')}>
        <Camera className="h-4.5 w-4.5 shrink-0" aria-hidden />
        {big ? 'Scan a QR' : 'Scan'}
      </Link>
    </div>
  )

  return (
    <Dialog open={open} onClose={close} ariaLabel="Capture a moment" align="bottom" className="mt-auto sm:max-w-md">
      <div
        data-zap-view={view}
        className="relative flex max-h-[92dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-[36px] border-x border-t border-border bg-canvas p-4.5 pb-[max(1rem,env(safe-area-inset-bottom))] lift-3 sm:max-h-[90dvh] sm:rounded-[36px] sm:border"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-primary-bg/40" />

        {view === 'held' ? (
          <div className="relative flex flex-col items-center gap-3.5 py-2 text-center">
            <p className="text-lead font-normal text-text">Your code</p>
            <QrTile code={code} size="lg" label="Back to the menu" onClick={() => setView('menu')} />
            <p className="serif text-[24px] leading-tight text-text">Hold it up and say hi.</p>
            {shareScan(true)}
            <Button variant="ghost" onClick={() => setView('menu')}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to menu
            </Button>
          </div>
        ) : view === 'compose' ? (
          <div className="relative flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setView('menu')}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
              <IconButton label="Close" onClick={close}>
                <X className="h-5 w-5" aria-hidden />
              </IconButton>
            </div>
            <CaptureBox key={mode} scopeId={scopeId} visibility="public" defaultMode={mode} compactTools placeholder="Share something real from your day…" />
          </div>
        ) : (
          <>
            {/* 1. Your code. */}
            <div className="relative flex items-center gap-4">
              <QrTile
                code={code}
                size="sm"
                label="Hold up your code"
                onClick={() => {
                  tap('code')
                  setView('held')
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-body font-normal text-text">Your code</p>
                <p className="serif text-[20px] leading-tight text-text">{code ? 'Tap to hold it up.' : 'Make yours on Codes.'}</p>
                {shareScan(false)}
              </div>
            </div>

            {/* 2. The post box: type in place; the photo button and an empty send open the full composer. */}
            <div className="relative flex flex-col gap-1">
              <form
                className="flex items-center gap-1.5 rounded-pill bg-surface py-1.5 pl-2 pr-1.5 ring-1 ring-inset ring-border lift-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                <Avatar src={prompt?.me?.avatar} name={prompt?.me?.name || 'You'} size="sm" />
                <Input
                  variant="seamless"
                  aria-label="Create a post"
                  placeholder="Create a post"
                  value={draft}
                  maxLength={500}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    if (posted) setPosted(null)
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-text"
                />
                <IconButton label="Add a photo" size="lg" onClick={() => compose('photo')}>
                  <ImagePlus className="h-5 w-5" aria-hidden />
                </IconButton>
                <IconButton type="submit" label={draft.trim() ? 'Post it' : 'Open the full composer'} variant="filled" size="lg" loading={posting} className="fq-pa rounded-pill">
                  <Send className="h-4.5 w-4.5" aria-hidden />
                </IconButton>
              </form>
              {posted && (
                <p role="status" className="px-3 text-meta text-muted">
                  {posted}
                </p>
              )}
            </div>

            {/* 3. Open the timer. */}
            <button type="button" onClick={openTimer(false)} className={choiceTileClasses(false, 'relative flex min-h-17 w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left lift-1')}>
              <span className="fq-pa flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary text-on-primary" aria-hidden>
                <BreatheIcon className="h-5 w-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold text-text">Open the timer</span>
                <span className="truncate text-body-sm font-medium text-muted">{prompt?.line ?? 'Be Still or Get Moving.'}</span>
              </span>
              <ChevronRight className="h-4.5 w-4.5 shrink-0 text-muted" aria-hidden />
            </button>

            {/* 4. Check in, Log a practice. */}
            <div className="relative grid grid-cols-2 gap-2.5">
              <Link href="/scan?hint=checkin" onClick={() => { tap('checkin'); close() }} className={choiceTileClasses(false, 'relative flex flex-col gap-2.5 rounded-[16px] p-3 lift-1')}>
                {prompt?.liveEvent && <span aria-hidden className="absolute right-3 top-3 h-2 w-2 rounded-pill bg-primary motion-safe:animate-pulse" />}
                <TileIcon>
                  <CalendarCheck className="h-5 w-5" />
                </TileIcon>
                <span className="flex flex-col">
                  <span className="text-body font-semibold text-text">Check in</span>
                  <span className="text-body-sm font-medium text-muted">{prompt?.liveEvent ? 'Happening now' : 'Scan at the door'}</span>
                </span>
              </Link>
              <button type="button" onClick={openTimer(true)} className={choiceTileClasses(false, 'relative flex flex-col gap-2.5 rounded-[16px] p-3 text-left lift-1')}>
                <TileIcon>
                  <NotebookPen className="h-5 w-5" />
                </TileIcon>
                <span className="flex flex-col">
                  <span className="text-body font-semibold text-text">Log a practice</span>
                  <span className="text-body-sm font-medium text-muted">No timer, one tap</span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

function TileIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-primary-bg text-primary-strong" aria-hidden>
      {children}
    </span>
  )
}

/** The member's real code (the avatar-centred SVG from /api/qr). It is a button: the small tile
 *  holds the code up, the big one puts it back. Without a code yet it links to /codes. */
function QrTile({ code, size, label, onClick }: { code: { id: string } | null; size: 'sm' | 'lg'; label: string; onClick: () => void }) {
  const box = size === 'lg' ? 'h-70 w-70 rounded-[24px] p-4.5 lift-2' : 'h-33 w-33 rounded-[16px] p-2.5 lift-1'
  // KEEP bg-white: a QR reader needs a true-white quiet zone behind the modules, so this fill is a scanner requirement rather than a themed surface.
  const tile = `flex shrink-0 items-center justify-center bg-white ring-1 ring-inset ring-border ${box}`
  if (!code) {
    return (
      <Link href="/codes" aria-label="Make your code" className={tile}>
        <QrCode className="h-1/2 w-1/2 text-muted" aria-hidden />
      </Link>
    )
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className="shrink-0 rounded-[16px] border-0 p-0">
      <span className={tile}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a same-origin SVG from /api/qr, behind sign-in; the optimizer cannot fetch it */}
        <img src={`/api/qr?code=${encodeURIComponent(code.id)}`} alt="" className="h-full w-full" />
      </span>
    </button>
  )
}
