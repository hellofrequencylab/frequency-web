'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { Press_Start_2P, VT323 } from 'next/font/google'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDot, CornerUpLeft, Download, EyeOff, IdCard, Nfc, RefreshCw, ScanLine, Wifi, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import {
  cancelConsoleCard,
  finishConsoleCard,
  provisionConsoleScanner,
  readConsoleScanner,
  retireConsoleScanner,
  startConsoleCard,
} from '@/lib/devices/actions'
import { dismissBadgeRequest, lookupConsoleSpace } from '@/lib/devices/badge-actions'
import type { BadgeRequestRow } from '@/lib/devices/badges'
import { checkPlacardTap, dropSpaceTag, finishSpaceTag, readSpaceTags, startSpaceTag } from '@/lib/devices/tag-actions'
import type { SpaceTagRow } from '@/lib/devices/space-tags'
import { listRelayDevicesForConsole, setConsoleRelay } from '@/lib/devices/relay-actions'
import type { ConsoleRelayDevice } from '@/lib/devices/relay-store'
import type { FirmwareRelease } from '@/lib/devices/firmware'
import { RpcClient, DeviceError } from '@/lib/device/client'
import { openWebSerial, pickPort, rememberedPort, webSerialAvailable } from '@/lib/device/web-serial'
import { forwardScan, scanReasonText, type RelayAnswer } from '@/lib/device/cable-scan'
import { ScreenMirror, SCREEN_H, SCREEN_W } from '@/lib/device/screen-mirror'
import { openRelayTransport } from '@/lib/device/relay-transport'
import { flashApp } from '@/lib/device/flasher'
import type {
  FrequencyConfig,
  HatProbe,
  LightShowState,
  ScanRelay,
  ScanResult,
  SystemCaps,
  SystemStatus,
  TagRead,
  TagWritten,
  WifiJoin,
  WifiNetwork,
  WifiScan,
} from '@/lib/device/types'
import {
  CU_ICONS,
  CU_SCOPE_STYLE,
  hueCss,
  paintIcon,
  paintUnicorn,
  rainbowFillCss,
  rainbowFrameCss,
  type HueMode,
} from '@/lib/theme/cyberunicorn'
import { startBootScene } from '@/lib/theme/cu-boot-scene'

// THE CYBERUNICORN PORTAL (LIVE-1182; build plan phases 1 to 5, docs/LOYALTY.md "Check-in placards" and
// section 7 "Counter scanners"). Platform staff plug the CyberUnicorn 5000 into this computer and, for
// ANY Space, program its NFC check-in PLACARD on the spot: pick the Space, write its signed door check-in
// link (/n/<node>?s=..., lib/devices/tag-actions.ts) onto an NTAG sticker with `frequency.write_tag`, then
// tap it with a phone and watch the check-in land (the page polls the door node's captures). The written
// sticker goes on the Space's placard list (public.space_tags). This is the sales-visit demo, so it leads.
//
// Second, MEMBER BADGES: a member card minted server-side for a Space (lib/devices/actions.ts), written,
// then bound to the chip, or discarded if the device says the write failed. Third, the COUNTER SCANNER:
// make the board a Space's scanner with `frequency.provision`, put it on Wi-Fi, and while this page is
// open forward the scans a board with no Wi-Fi signs and sends up the cable (lib/device/cable-scan.ts).
//
// The left half is the device itself: while the board boots it plays the board's own boot scene
// (lib/theme/cu-boot-scene.ts), and once connected it can mirror the board's screen live over the cable
// (Bruce's `display start` draw-call stream, lib/device/screen-mirror.ts) with the four buttons under it
// (`screen.nav`). Screens the firmware draws off-screen and pushes whole (the boot scene, Light Show,
// Spectrum) do not mirror.
//
// This is the ONE surface on the page that wears the CyberUnicorn 5000 design system (lib/theme/
// cyberunicorn.ts, scoped to this root): black screen, a rainbow frame walking the hue wheel, rainbow
// titles in the pixel display face, VT323 body text, stepped 25 fps motion that stops under reduced
// motion. Copy follows the system's two registers: plain for anything to act on, playful only at idle.
// No em dashes, no emoji.

const display = Press_Start_2P({ weight: '400', subsets: ['latin'], display: 'swap', preload: false, variable: '--cu-font-display' })
const body = VT323({ weight: '400', subsets: ['latin'], display: 'swap', preload: false, variable: '--cu-font-body' })

/** How long the device waits for a card, and how long the page waits for the device's answer. */
const TAP_MS = 30000
// The device probes the hat (about 6 s) before it starts its own 30 s wait, so the page waits longer.
const TAP_REPLY_MS = TAP_MS + 15000
/** Opening the port reboots the CYD on macOS (the CH340 driver pulses EN), and a boot to the main menu
 *  takes about 18 s, so the page keeps asking for up to this long. Measured on hardware 2026-10-20. */
const BOOT_WAIT_MS = 40000
/** The board uses the cable for a scan only if this page sent a line in the last 30 s. */
const KEEPALIVE_MS = 10000
/** How often the "tap it with your phone" step asks whether the check-in landed, and for how long. */
const VERIFY_POLL_MS = 3000
const VERIFY_MAX_MS = 5 * 60 * 1000
/** What goes on the chip next to the link, so a tag read shows where it belongs. */
const PLACARD_LABEL_MAX = 30

/** The time, for the connect loop. Read only inside event handlers; the React compiler's purity rule cannot
 *  tell that the async connect handler never runs during render, so the clock is read through here. */
function wallClock(): number {
  return Date.now()
}

// ── The 25 fps tick (FRAME_MS = 40), one rAF for the whole panel, frozen under reduced motion. ─────

let tickNow = 0
const tickListeners = new Set<() => void>()
let tickRaf = 0
function tickSubscribe(listener: () => void) {
  tickListeners.add(listener)
  if (tickListeners.size === 1 && typeof window !== 'undefined') {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!still) {
      let last = 0
      const loop = (now: number) => {
        if (now - last >= 40) {
          last = now
          tickNow = Math.floor(now / 40)
          for (const l of tickListeners) l()
        }
        tickRaf = requestAnimationFrame(loop)
      }
      tickRaf = requestAnimationFrame(loop)
    }
  }
  return () => {
    tickListeners.delete(listener)
    if (tickListeners.size === 0) cancelAnimationFrame(tickRaf)
  }
}
function useTick(): number {
  return useSyncExternalStore(
    tickSubscribe,
    () => tickNow,
    () => 0,
  )
}

// ── Skin pieces: web counterparts of the firmware's rainbow.h helpers. ────────────────────────────

/** cyberRainbowText(): every letter its own hue, walking with the phase. Read as one word. */
function RainbowText({ text, className, as: Tag = 'span' }: { text: string; className?: string; as?: 'span' | 'h3' | 'p' }) {
  const t = useTick()
  const phase = (t * 40) / 25 // cyberPhase(): 1 degree per 25 ms
  return (
    <Tag className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden style={{ color: hueCss(phase + i * 25) }}>
          {ch}
        </span>
      ))}
    </Tag>
  )
}

/** A pixel-art canvas, repainted on the tick. */
function PixelCanvas({ w, h, cell, paint, label }: { w: number; h: number; cell: number; paint: (ctx: CanvasRenderingContext2D, t: number) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const t = useTick()
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) paint(ctx, t)
  }, [t, paint])
  return (
    <canvas
      ref={ref}
      width={w * cell}
      height={h * cell}
      role="img"
      aria-label={label}
      className="block shrink-0 self-start [image-rendering:pixelated]"
    />
  )
}

function Icon({ name, cell = 3 }: { name: keyof typeof CU_ICONS; cell?: number }) {
  const icon = CU_ICONS[name]
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, t: number) => paintIcon(ctx, icon.grid, icon.mode as HueMode, t, cell),
    [icon, cell],
  )
  return <PixelCanvas w={32} h={24} cell={cell} paint={paint} label={icon.label} />
}

function Unicorn({ cell = 2 }: { cell?: number }) {
  const paint = useCallback((ctx: CanvasRenderingContext2D, t: number) => paintUnicorn(ctx, t, cell), [cell])
  return <PixelCanvas w={40} h={29} cell={cell} paint={paint} label="CyberUnicorn" />
}

/** cyberRainbowFrame(): the 1 px outline whose hue walks round the panel. */
function RainbowFrame({ children }: { children: ReactNode }) {
  const t = useTick()
  return (
    <div className="rounded-[var(--cu-radius)] p-px" style={{ background: rainbowFrameCss((t * 40) / 25) }}>
      <div className="rounded-[var(--cu-radius)] bg-[var(--cu-screen)]">{children}</div>
    </div>
  )
}

/** cyberRainbowFill(): the boot loader's bar with its cyan outline. `value` 0 to 1. */
function RainbowBar({ value, label }: { value: number; label: string }) {
  const t = useTick()
  const v = Math.max(0, Math.min(1, value))
  // The hue walks 2 degrees per px from the bar's left edge, laid out over a 640 px track and clipped
  // by the fill's own width, so no layout read is needed.
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="h-2.5 w-full border border-[var(--cu-secondary)]"
    >
      <div className="h-full" style={{ width: `${v * 100}%`, background: rainbowFillCss(640, t * 10), backgroundSize: '640px 100%' }} />
    </div>
  )
}

/** On-device button language: magenta fill with black text when it is THE action, cyan outline otherwise. */
function CuButton({
  children,
  onClick,
  disabled,
  tone = 'primary',
  type = 'button',
  wide,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'primary' | 'secondary' | 'quiet'
  type?: 'button' | 'submit'
  /** Fill the column (the controls beside the screen). */
  wide?: boolean
}) {
  const tones = {
    primary: 'bg-[var(--cu-primary)] text-[var(--cu-screen)] hover:bg-[var(--cu-attention)]',
    secondary: 'border border-[var(--cu-secondary)] text-[var(--cu-secondary)] hover:bg-[var(--cu-secondary)] hover:text-[var(--cu-screen)]',
    quiet: 'text-[var(--cu-muted)] underline-offset-4 hover:text-[var(--cu-text)] hover:underline',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${wide ? 'w-full' : ''} min-h-11 px-4 py-2 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase leading-none tracking-normal outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cu-secondary)] disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[var(--cu-muted)] disabled:opacity-60 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

function Row({ label, value, tone = 'text' }: { label: string; value: string; tone?: 'text' | 'ok' | 'attention' | 'secondary' }) {
  const color = {
    text: 'text-[var(--cu-text)]',
    ok: 'text-[var(--cu-ok)]',
    attention: 'text-[var(--cu-attention)]',
    secondary: 'text-[var(--cu-secondary)]',
  }[tone]
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-[var(--cu-muted)]">{label}</dt>
      <dd className={`min-w-0 break-all ${color}`}>{value}</dd>
    </div>
  )
}

// ── The device conversation ───────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'connecting' | 'ready' | 'minting' | 'tap' | 'verify' | 'checking' | 'scanning' | 'working' | 'done'

interface Done {
  title: string
  lines: { label: string; value: string; tone?: 'text' | 'ok' | 'attention' | 'secondary' }[]
  note?: string
}

/** One plain instruction for each way a tag command can fail (firmware cardStatusText + error codes). */
function tagProblem(e: unknown): string {
  if (!(e instanceof DeviceError)) return 'Something went wrong. Try again.'
  const raw = e.message
  switch (e.code) {
    case 'no_reader':
      return 'Turn DIP 3 ON so the card reader wakes up, then try again.'
    case 'busy':
      return 'The reader is busy. Go back to the main menu on the CyberUnicorn and try again.'
    case 'timeout':
      return /no card/i.test(raw)
        ? 'No card in 30 seconds. Hold it flat on the reader and try again.'
        : 'The CyberUnicorn stopped answering. Check the cable and connect again.'
    case 'write_failed':
      if (/ntag/i.test(raw)) return 'That card is not an NTAG213, 215 or 216, so it cannot hold a Frequency link. Use an NTAG card or sticker.'
      if (/locked/i.test(raw)) return 'That card is locked for good. Use a blank one.'
      if (/too long/i.test(raw)) return 'That card is too small for the link. Use an NTAG215 or 216.'
      return 'The write did not take. Hold the card still on the reader and try again.'
    case 'card_error':
      return 'The reader could not talk to that card. Lift it off, put it back and try again.'
    case 'not_available':
    case 'unknown_command':
      return 'This CyberUnicorn firmware cannot write cards over USB. Update it, then try again.'
    case 'disconnected':
      return 'The CyberUnicorn was unplugged. Plug it back in and connect.'
    default:
      return raw || 'Something went wrong on the CyberUnicorn. Try again.'
  }
}

/** Errors where the card may or may not have been written: keep the mint rather than kill a real card. */
function outcomeUnknown(e: unknown): boolean {
  return e instanceof DeviceError && (e.code === 'disconnected' || (e.code === 'timeout' && !/no card/i.test(e.message)))
}

type Target = { spaceId: string; spaceName: string }
type Scanner = { spaceId: string; spaceName: string; label: string; active: boolean }
type CheckIn = { at: number; name: string; ok: boolean; detail: string }
type Mode = 'placards' | 'badges' | 'scanner' | 'remote' | 'update'
const MODE_TITLE: Record<Mode, string> = {
  placards: 'CHECK-IN PLACARDS',
  badges: 'MEMBER BADGES',
  scanner: 'COUNTER SCANNER',
  remote: 'WI-FI REMOTE',
  update: 'UPDATE FIRMWARE',
}
/** The jobs that write to a chip or set the board up. They need the cable: the relay allows none of them. */
const CABLE_MODES: Mode[] = ['placards', 'badges', 'scanner']
type Link = 'usb' | 'wifi'
/** Where a firmware install is: downloading the checked image, writing it, or finished either way. */
type Flash = { stage: 'download' | 'write' | 'done' | 'failed'; progress: number; version: string; message?: string }
type LogLine = { dir: string; text: string }
/** A placard just written, waiting for its phone tap. `since` is when the write started. */
type Placard = { nodeId: string; since: string; label: string; chip: string; spaceName: string }
type NavKey = 'prev' | 'next' | 'sel' | 'esc'

/** One check-in line from the server's answer. */
function checkInFrom(answer: RelayAnswer | ScanResult, viaCable: boolean): CheckIn {
  const b = ('body' in answer ? answer.body : answer) as { ok?: unknown; reason?: unknown; member?: { display_name?: unknown } | null; loyalty?: { stamps?: unknown; required?: unknown; earned?: unknown } | null }
  const name = typeof b.member?.display_name === 'string' ? b.member.display_name : 'A card'
  const ok = 'body' in answer ? b.ok === true : !('relay' in answer) && b.member != null
  const l = b.loyalty
  const stamps = l && typeof l.stamps === 'number' && typeof l.required === 'number' ? `${l.stamps} of ${l.required} stamps${l.earned ? ', reward earned' : ''}` : 'Checked in'
  return { at: Date.now(), name, ok, detail: ok ? `${stamps}${viaCable ? ' (through this computer)' : ''}` : scanReasonText(b.reason) }
}

function chipText(tag: TagRead): string {
  return [tag.type, tag.uid].filter(Boolean).join('  ') || 'Unknown'
}

const LABEL_CLASS = 'block font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]'

export function CyberUnicornConsole({
  requests,
  spaces,
  initialSpace = null,
}: {
  requests: BadgeRequestRow[]
  spaces: { slug: string; name: string }[]
  /** The Space a `?space=` link opened the portal on. */
  initialSpace?: Target | null
}) {
  const router = useRouter()
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => webSerialAvailable(),
    () => true,
  )
  const clientRef = useRef<RpcClient | null>(null)
  const [client, setClient] = useState<RpcClient | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<Mode>('placards')
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [hat, setHat] = useState<HatProbe | null>(null)
  const [handle, setHandle] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [tapStarted, setTapStarted] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [bootStarted, setBootStarted] = useState<number | null>(null)
  const [cardFor, setCardFor] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(initialSpace)
  const [spaceSlug, setSpaceSlug] = useState('')
  const [caps, setCaps] = useState<string[] | null>(null)
  const [config, setConfig] = useState<FrequencyConfig | null>(null)
  const [scanner, setScanner] = useState<Scanner | null>(null)
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null)
  const [ssid, setSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [placardLabel, setPlacardLabel] = useState('')
  const [placard, setPlacard] = useState<Placard | null>(null)
  const [tags, setTags] = useState<SpaceTagRow[] | null>(null)
  // A Space handed in by the link: load its placards once.
  const initialLoad = useRef(false)
  useEffect(() => {
    if (!initialSpace || initialLoad.current) return
    initialLoad.current = true
    void readSpaceTags(initialSpace.spaceId).then((out) => setTags(isError(out) ? [] : out.data))
  }, [initialSpace])
  const [mirror, setMirror] = useState(false)
  // Once linked over the cable the screen is the live mirror by default (owner, 2026-10-20). Turning it off
  // from the screen sticks until it is turned back on.
  const [wantMirror, setWantMirror] = useState(true)
  const mirrorStarting = useRef(false)
  const [link, setLink] = useState<Link>('usb')
  const [relayDevices, setRelayDevices] = useState<ConsoleRelayDevice[] | null>(null)
  const [relayNote, setRelayNote] = useState<string | null>(null)
  const [show, setShow] = useState<LightShowState | null>(null)
  const [firmware, setFirmware] = useState<{ release: FirmwareRelease | null; error: string | null } | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const flashing = flash?.stage === 'download' || flash?.stage === 'write'

  // Leaving mid-install leaves the board without a working OS until an install finishes, so ask first.
  useEffect(() => {
    if (!flashing) return
    const hold = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [flashing])

  // The countdown under "TAP THE CARD", and the boot bar while the board restarts.
  useEffect(() => {
    if (tapStarted === null && bootStarted === null) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [tapStarted, bootStarted])

  // Close the port when the panel goes away, so the next visit can open it.
  useEffect(() => () => void clientRef.current?.close(), [])

  const disconnect = useCallback(async () => {
    const c = clientRef.current
    clientRef.current = null
    setClient(null)
    setPhase('idle')
    setStatus(null)
    setHat(null)
    setTapStarted(null)
    setCaps(null)
    setConfig(null)
    setScanner(null)
    setNetworks(null)
    setMirror(false)
    setShow(null)
    setLink('usb')
    await c?.close().catch(() => undefined)
  }, [])

  // Let go of the port when the page goes away or the tab is hidden while nothing is in flight, so a
  // flash or another tool can open it. Connecting again always takes a click (it reboots the board).
  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = phase === 'connecting' || phase === 'minting' || phase === 'tap' || phase === 'checking' || phase === 'scanning' || phase === 'working'
  }, [phase])

  // The keepalive: a status ping every 10 s while nothing else is in flight. The board relays a scan
  // through the cable only while it has heard from this page in the last 30 s.
  const connectedNow = phase !== 'idle' && phase !== 'connecting'
  useEffect(() => {
    if (!connectedNow) return
    const id = setInterval(() => {
      const c = clientRef.current
      if (!c || busyRef.current) return
      void c.call<SystemStatus>('system.status').then(setStatus, () => undefined)
    }, KEEPALIVE_MS)
    return () => clearInterval(id)
  }, [connectedNow])
  useEffect(() => {
    const release = () => {
      if (clientRef.current) void disconnect()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !busyRef.current) release()
    }
    window.addEventListener('pagehide', release)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', release)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [disconnect])

  // The chosen Space's placards. Needs no device, so a Space can be lined up before the visit.
  const loadTags = useCallback(async (spaceId: string) => {
    const out = await readSpaceTags(spaceId)
    setTags(isError(out) ? [] : out.data)
  }, [])

  // "Tap it with your phone": ask every few seconds whether a check-in landed on the Space's door link
  // since the write started. The first one is the phone test passing.
  useEffect(() => {
    if (phase !== 'verify' || !placard) return
    let live = true
    const started = Date.now()
    const id = setInterval(() => {
      if (Date.now() - started > VERIFY_MAX_MS) {
        clearInterval(id)
        return
      }
      void checkPlacardTap(placard.nodeId, placard.since).then((out) => {
        if (!live || isError(out) || !out.data) return
        clearInterval(id)
        const hit = out.data
        setDone({
          title: 'CHECKED IN',
          lines: [
            { label: 'Member', value: hit.name, tone: 'ok' },
            { label: 'Space', value: placard.spaceName },
            { label: 'Placard', value: placard.label, tone: 'secondary' },
            { label: 'Time', value: new Date(hit.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) },
          ],
          note: `${hit.name} just checked in at ${placard.spaceName} from the placard. Every member who taps it gets the same check-in and a stamp on their Regulars card.`,
        })
        setPhase('done')
      })
    }, VERIFY_POLL_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [phase, placard])

  function logLine(l: LogLine) {
    setLog((prev) => [...prev.slice(-39), `${l.dir === 'out' ? '>' : l.dir === 'in' ? '<' : '#'} ${l.text}`])
  }

  async function connect() {
    if (flashing) return
    setProblem(null)
    setDone(null)
    let port
    try {
      port = (await rememberedPort()) ?? (await pickPort())
    } catch (e) {
      // Closing the picker without choosing is not an error.
      if (e instanceof Error && e.name === 'NotFoundError') return
      setProblem(e instanceof Error ? e.message : 'Could not open the port picker.')
      return
    }
    setPhase('connecting')
    try {
      const transport = await openWebSerial(port)
      const next = new RpcClient(transport)
      clientRef.current = next
      setClient(next)
      // Whether the board printed anything at all tells a dead or busy port from firmware that has no remote app.
      let heard = 0
      setLog([])
      next.log.on((l) => {
        if (l.dir === 'in') heard++
        logLine(l)
      })
      next.events.on((e) => {
        if (e.event === 'frequency.waiting_for_tag') {
          setTapStarted(Date.now())
          setNow(Date.now())
        } else if (e.event === 'hello') {
          // The board restarted on its own: give it the time again, or cable scans have none.
          void setClock(next)
          setMirror(false)
        } else if (e.event === 'frequency.scan_relay') {
          void relayScan(next, (e.data ?? {}) as ScanRelay)
        }
      })
      transport.onClose((reason) => {
        if (clientRef.current !== next) return
        clientRef.current = null
        setClient(null)
        setPhase('idle')
        setStatus(null)
        setHat(null)
        setTapStarted(null)
        setMirror(false)
        setProblem(`${reason} Plug the CyberUnicorn back in and connect.`)
      })

      // Opening the port reboots the board (measured: the CH340 driver on macOS pulses EN however the page
      // sets DTR and RTS), and it reads nothing until its setup ends, about 18 s later. Ask every few
      // seconds until a status comes back. Pings sent during boot are answered late and ignored by id.
      let s: SystemStatus | null = null
      const until = wallClock() + BOOT_WAIT_MS
      setBootStarted(wallClock())
      while (!s && wallClock() < until && clientRef.current === next) {
        s = await next.call<SystemStatus>('system.status', {}, { timeoutMs: 3000 }).catch(() => null)
      }
      setBootStarted(null)
      if (!s) {
        await disconnect()
        setProblem(
          heard === 0
            ? 'Nothing came from the CyberUnicorn at all. Check it is switched on and that you picked its USB serial port. If you just flashed it, unplug it for 5 seconds, plug it back in, wait for its main menu, then connect again.'
            : 'The CyberUnicorn is printing but not answering commands. Wait for its main menu and connect again. If it still does not answer, it needs the CyberUnicorn OS build with the remote app. Device log below shows what it printed.',
        )
        return
      }
      setStatus(s)
      const c = await next.call<SystemCaps>('system.caps').catch(() => null)
      const commands = c?.commands ?? []
      setCaps(commands)
      if (commands.includes('system.time')) await setClock(next)
      setHat(await next.call<HatProbe>('hat.probe').catch(() => null))
      if (commands.includes('frequency.config')) await refreshConfig(next)
      setPhase('ready')
    } catch (e) {
      await disconnect()
      setProblem(e instanceof Error ? e.message : 'Could not connect.')
    }
  }

  // ── Over Wi-Fi: the internet relay (lib/device/relay-transport.ts). The board answers only its relay
  // allow-list there (status, Light Show, LED, sound, sensors, reading a tag), so writing placards and
  // badges, setting up a scanner and the live screen stay on the cable.

  async function loadRelayDevices() {
    setRelayNote(null)
    const out = await listRelayDevicesForConsole()
    if (isError(out)) {
      setRelayDevices([])
      setRelayNote(out.error)
      return
    }
    setRelayDevices(out.data)
  }

  async function toggleRelay(d: ConsoleRelayDevice, on: boolean) {
    setRelayNote(null)
    const out = await setConsoleRelay(d.deviceId, on)
    if (isError(out)) setRelayNote(out.error)
    await loadRelayDevices()
  }

  async function connectRelay(d: ConsoleRelayDevice) {
    if (flashing || clientRef.current) return
    setProblem(null)
    setDone(null)
    setRelayNote(null)
    setPhase('connecting')
    try {
      const transport = await openRelayTransport(d.deviceId, { label: d.label })
      const next = new RpcClient(transport)
      clientRef.current = next
      setClient(next)
      setLink('wifi')
      setLog([])
      next.log.on(logLine)
      next.events.on((e) => {
        if (e.event === 'lightshow.state') setShow((e.data ?? null) as LightShowState | null)
      })
      transport.onClose((reason) => {
        if (clientRef.current !== next) return
        clientRef.current = null
        setClient(null)
        setPhase('idle')
        setStatus(null)
        setShow(null)
        setLink('usb')
        setProblem(`${reason} Connect again once it is back on Wi-Fi.`)
      })
      setStatus(await next.call<SystemStatus>('system.status', {}, { timeoutMs: 8000 }))
      setCaps([])
      setShow(await next.call<LightShowState>('lightshow.state').catch(() => null))
      setPhase('ready')
    } catch (e) {
      await disconnect()
      setProblem(e instanceof Error ? e.message : 'Could not reach the CyberUnicorn over Wi-Fi.')
    }
  }

  /** One remote command; a refusal or a timeout lands in the problem line. */
  async function remote<T>(cmd: Parameters<RpcClient['call']>[0], args: Record<string, unknown> = {}): Promise<T | null> {
    const c = clientRef.current
    if (!c || busyRef.current) return null
    setProblem(null)
    try {
      return await c.call<T>(cmd, args)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The CyberUnicorn did not answer.')
      return null
    }
  }

  async function setLightShow(args: Record<string, unknown>) {
    const s = await remote<LightShowState>('lightshow.set', args)
    if (s) setShow(s)
  }

  // ── Firmware: the newest cu5k-v release, written over the cable with esptool (lib/device/flasher.ts).

  async function loadFirmware() {
    setFirmware(null)
    try {
      const res = await fetch('/api/devices/firmware', { cache: 'no-store' })
      const json = (await res.json().catch(() => null)) as { data?: { release?: FirmwareRelease | null } | null; error?: { message?: string } | null } | null
      if (!res.ok || !json?.data) {
        setFirmware({ release: null, error: json?.error?.message ?? 'Could not check for an update. Try again.' })
        return
      }
      setFirmware({ release: json.data.release ?? null, error: null })
    } catch {
      setFirmware({ release: null, error: 'Could not check for an update. Check your connection and try again.' })
    }
  }

  async function installFirmware(release: FirmwareRelease) {
    if (flashing) return
    setProblem(null)
    setNotice(null)
    // Ask for the port first, while the click still counts as the person choosing it.
    let port
    try {
      port = (await rememberedPort()) ?? (await pickPort())
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundError') return
      setProblem(e instanceof Error ? e.message : 'Could not open the port picker.')
      return
    }
    // esptool opens the port itself, so the console lets go of it first.
    if (clientRef.current) await disconnect()
    setFlash({ stage: 'download', progress: 0, version: release.version })
    try {
      const res = await fetch(release.app.url, { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not download the update. Try again.')
      const bytes = new Uint8Array(await res.arrayBuffer())
      setFlash({ stage: 'write', progress: 0, version: release.version })
      await flashApp(port, bytes, {
        expectedSha256: release.app.sha256,
        onProgress: (p) => setFlash((f) => (f ? { ...f, progress: p } : f)),
        onLog: (text) => logLine({ dir: 'note', text }),
      })
      setFlash({ stage: 'done', progress: 1, version: release.version })
    } catch (e) {
      setFlash({ stage: 'failed', progress: 0, version: release.version, message: e instanceof Error ? e.message : 'The update did not finish.' })
    }
  }

  async function setClock(c: RpcClient) {
    await c.call('system.time', { epoch: Math.floor(Date.now() / 1000) }).catch(() => undefined)
  }

  async function refreshConfig(c: RpcClient) {
    const cfg = await c.call<FrequencyConfig>('frequency.config').catch(() => null)
    setConfig(cfg)
    if (!cfg?.device_id) {
      setScanner(null)
      return
    }
    const info = await readConsoleScanner(cfg.device_id)
    setScanner(isError(info) ? null : info.data)
  }

  // A board with no Wi-Fi signed a scan and sent it up the cable: post it, then hand the answer back.
  async function relayScan(c: RpcClient, relay: ScanRelay) {
    if (!relay.nonce) return
    const answer = await forwardScan(relay)
    await c.call('frequency.relay_reply', { nonce: relay.nonce, status: answer.status, body: answer.body }).catch(() => undefined)
    setCheckIns((prev) => [checkInFrom(answer, true), ...prev].slice(0, 6))
    if (answer.status === 0 || answer.status >= 500) void refreshConfig(c)
  }

  // ── The live screen: Bruce's own draw-call stream over the cable, and its four buttons. ───────────

  async function startMirror() {
    const c = clientRef.current
    if (!c?.canMirror) return
    c.setScreenStream(true)
    // `display start` is a plain Bruce CLI line. Like any CLI line it sends the board to its main menu,
    // which also gives the mirror a full first frame to draw.
    await c.raw('display start').catch(() => undefined)
    setMirror(true)
  }

  async function stopMirror() {
    const c = clientRef.current
    setMirror(false)
    if (!c) return
    await c.raw('display stop').catch(() => undefined)
    // Let the last packets in flight drain through the demux before text-only reading resumes.
    setTimeout(() => c.setScreenStream(false), 400)
  }

  // Bruce switches screen logging off by itself now and then (stopWebUi). Stop, pause, start brings it back.
  async function refreshMirror() {
    const c = clientRef.current
    if (!c) return
    await c.raw('display stop').catch(() => undefined)
    await new Promise((r) => setTimeout(r, 500))
    await c.raw('display start').catch(() => undefined)
  }

  async function press(key: NavKey) {
    const c = clientRef.current
    if (!c || busyRef.current) return
    if (caps?.includes('screen.nav')) await c.call('screen.nav', { key }).catch(() => undefined)
    else await c.raw(`nav ${key}`).catch(() => undefined)
  }

  /** Run one board-setup step with the panel marked busy; a failure lands in the problem line. */
  async function step(work: (c: RpcClient) => Promise<void>) {
    const c = clientRef.current
    if (!c) return
    setProblem(null)
    setNotice(null)
    setPhase('working')
    try {
      await work(c)
    } catch (e) {
      setProblem(e instanceof DeviceError ? e.message : e instanceof Error ? e.message : 'Something went wrong. Try again.')
    }
    if (clientRef.current) setPhase('ready')
  }

  // Make this board the chosen Space's counter scanner. A board set up for another scanner id is
  // switched over and the old id revoked, so a board only ever answers for one Space.
  function setUpScanner() {
    if (!target) return
    void step(async (c) => {
      const out = await provisionConsoleScanner(target.spaceId, 'CyberUnicorn 5000')
      if (isError(out)) throw new Error(out.error)
      const previous = config?.device_id
      let cfg: FrequencyConfig
      try {
        cfg = await c.call<FrequencyConfig>('frequency.provision', { device_id: out.data.deviceId, secret: out.data.secret, base: out.data.base, reader: true })
      } catch (e) {
        await retireConsoleScanner(out.data.deviceId)
        throw e
      }
      if (previous && previous !== out.data.deviceId) await retireConsoleScanner(previous)
      setConfig(cfg)
      setScanner({ spaceId: target.spaceId, spaceName: target.spaceName, label: 'CyberUnicorn 5000', active: true })
      setNotice(`This board is now ${target.spaceName}'s counter scanner. Members tap their badge on its Frequency screen to check in.`)
      router.refresh()
    })
  }

  function forgetScanner() {
    void step(async (c) => {
      const previous = config?.device_id
      const cfg = await c.call<FrequencyConfig>('frequency.unprovision')
      if (previous) await retireConsoleScanner(previous)
      setConfig(cfg)
      setScanner(null)
      setNotice('The board forgot its scanner setup, and that scanner was revoked.')
    })
  }

  function findNetworks() {
    void step(async (c) => {
      const out = await c.call<WifiScan>('wifi.scan')
      const list = (out.networks ?? []).filter((n) => n.ssid && n.auth !== 'enterprise')
      setNetworks(list)
      if (list[0]?.ssid && !ssid) setSsid(list[0].ssid)
    })
  }

  function joinWifi() {
    if (!ssid) return
    void step(async (c) => {
      const out = await c.call<WifiJoin>('wifi.join', wifiPassword ? { ssid, password: wifiPassword, save: true } : { ssid, save: true })
      setWifiPassword('')
      setNetworks(null)
      setStatus(await c.call<SystemStatus>('system.status').catch(() => status))
      await refreshConfig(c)
      setNotice(
        out.internet === 'online'
          ? `On ${out.ssid ?? ssid} and online. Scans now go straight to Frequency.`
          : out.internet === 'captive'
            ? `${out.ssid ?? ssid} wants a sign-in page the board cannot open. Use another network or a phone hotspot.`
            : `Joined ${out.ssid ?? ssid}, but it has no internet. Scans go through this computer while it is plugged in.`,
      )
    })
  }

  // Tap a member card on the board and check them in, the way the counter does.
  async function testCheckIn() {
    const c = clientRef.current
    if (!c) return
    setProblem(null)
    setNotice(null)
    setDone(null)
    setPhase('scanning')
    setTapStarted(Date.now())
    setNow(Date.now())
    try {
      const out = await c.call<ScanResult>('frequency.scan', { timeout_ms: TAP_MS }, { timeoutMs: TAP_REPLY_MS })
      setTapStarted(null)
      if (out.relay?.nonce) {
        // Through the cable: the board cannot wait for a second command while it answers this one, so the
        // page posts the signed scan and keeps the answer.
        const answer = await forwardScan(out.relay)
        setCheckIns((prev) => [checkInFrom(answer, true), ...prev].slice(0, 6))
      } else {
        setCheckIns((prev) => [checkInFrom(out, false), ...prev].slice(0, 6))
      }
    } catch (e) {
      setTapStarted(null)
      const known: Record<string, string> = {
        not_member_card: 'That is not a Frequency member card.',
        reader_mode_off: 'Reader mode is off on the board. Set it up as a scanner first.',
        backend_not_set_up: 'The board is not set up as a scanner yet.',
        offline: 'The board is offline, so it saved the scan for later.',
        rejected: 'Frequency refused that scan.',
      }
      setProblem(e instanceof DeviceError && known[e.code] ? `${known[e.code]}${e.code === 'rejected' && e.message ? ` (${e.message})` : ''}` : tagProblem(e))
    }
    if (clientRef.current) setPhase('ready')
  }

  // DIP 3 can be flipped after connecting, so the reader can be looked for again without a reconnect (a reboot).
  async function recheckReader() {
    const c = clientRef.current
    if (!c) return
    setProblem(null)
    setHat(await c.call<HatProbe>('hat.probe').catch(() => null))
  }

  // A request in the queue fills in who and where; Program then writes it.
  function pick(r: BadgeRequestRow) {
    setProblem(null)
    setDone(null)
    chooseSpace({ spaceId: r.spaceId, spaceName: r.spaceName })
    setHandle(r.memberHandle ? `@${r.memberHandle}` : '')
    setMode('badges')
  }

  function chooseSpace(next: Target | null) {
    setTarget(next)
    setTags(null)
    setPlacard(null)
    if (next) void loadTags(next.spaceId)
  }

  async function findSpace() {
    setProblem(null)
    const found = await lookupConsoleSpace(spaceSlug)
    if (isError(found)) {
      setProblem(found.error)
      return
    }
    chooseSpace({ spaceId: found.data.id, spaceName: found.data.name })
  }

  async function dismiss(id: string) {
    const out = await dismissBadgeRequest(id)
    if (isError(out)) setProblem(out.error)
    else router.refresh()
  }

  async function removeTag(id: string) {
    const out = await dropSpaceTag(id)
    if (isError(out)) setProblem(out.error)
    else if (target) void loadTags(target.spaceId)
  }

  // THE PLACARD: get the Space's signed door link, write it to the sticker, list it, then wait for a
  // phone to tap it. A failed write leaves nothing behind: the link is the Space's, not minted per tag.
  async function writePlacard() {
    const c = clientRef.current
    if (!c || !target) return
    const { spaceId, spaceName } = target
    const label = placardLabel.trim().slice(0, PLACARD_LABEL_MAX)
    setProblem(null)
    setNotice(null)
    setDone(null)
    setPlacard(null)
    setPhase('minting')
    const link = await startSpaceTag(spaceId)
    if (isError(link)) {
      setProblem(link.error)
      setPhase('ready')
      return
    }
    // A minute of slack under the browser clock, so a server a little behind still counts the tap.
    const since = new Date(Date.now() - 60000).toISOString()
    setPhase('tap')
    setTapStarted(Date.now())
    setNow(Date.now())
    let tag: TagWritten
    const write = (url: string) =>
      c.call<TagWritten>(
        'frequency.write_tag',
        { url, label: label || `${spaceName} check-in`.slice(0, PLACARD_LABEL_MAX), timeout_ms: TAP_MS },
        { timeoutMs: TAP_REPLY_MS },
      )
    try {
      try {
        tag = await write(link.data.url)
      } catch (e) {
        // CyberUnicorn OS 0.1.0 refuses `m=` on a /n/ link before it waits for a tag. Write the bare
        // signed link instead: the check-in is the same, only Scan stats miss the "placard" tag.
        if (!(e instanceof DeviceError) || !/\?m= is for/.test(e.message)) throw e
        tag = await write(link.data.url.replace(/[?&]m=nfc$/, ''))
      }
    } catch (e) {
      setTapStarted(null)
      setProblem(tagProblem(e))
      if (clientRef.current) setPhase('ready')
      return
    }
    setTapStarted(null)
    const listed = await finishSpaceTag(spaceId, link.data.nodeId, tag.uid ?? null, tag.type ?? null, label)
    if (isError(listed)) setNotice(listed.error)
    setPlacard({ nodeId: link.data.nodeId, since, label: label || 'Check-in placard', chip: chipText(tag), spaceName })
    setPhase('verify')
    void loadTags(spaceId)
  }

  function skipVerify() {
    if (!placard) return
    setDone({
      title: 'PLACARD READY',
      lines: [
        { label: 'Space', value: placard.spaceName, tone: 'ok' },
        { label: 'Placard', value: placard.label, tone: 'secondary' },
        { label: 'Chip', value: placard.chip },
      ],
      note: 'Stick it where members walk in. A tap with any phone opens the check-in for this Space.',
    })
    setPhase('done')
  }

  async function program() {
    const c = clientRef.current
    if (!c || !target) return
    const { spaceId, spaceName } = target
    setProblem(null)
    setDone(null)
    setPhase('minting')
    const minted = await startConsoleCard(spaceId, handle)
    if (isError(minted)) {
      setProblem(minted.error)
      setPhase('ready')
      return
    }
    const { cardId, url, memberName } = minted.data
    setCardFor(memberName)
    setPhase('tap')
    setTapStarted(Date.now())
    setNow(Date.now())
    let tag: TagWritten
    try {
      tag = await c.call<TagWritten>(
        'frequency.write_tag',
        { url, label: `member ${handle.replace(/^@/, '')}`, timeout_ms: TAP_MS },
        { timeoutMs: TAP_REPLY_MS },
      )
    } catch (e) {
      setTapStarted(null)
      // A definite failure means nothing is on the card, so the mint goes. An unknown outcome keeps it:
      // the card may be good, and its first tap at the counter binds the chip.
      if (!outcomeUnknown(e)) await cancelConsoleCard(spaceId, cardId)
      setProblem(tagProblem(e))
      if (clientRef.current) setPhase('ready')
      return
    }
    setTapStarted(null)
    const bound = await finishConsoleCard(spaceId, cardId, tag.uid)
    setDone({
      title: 'NAILED IT',
      lines: [
        { label: 'Member', value: memberName, tone: 'ok' },
        { label: 'Space', value: spaceName },
        { label: 'Chip', value: chipText(tag) },
        { label: 'Link', value: tag.written ?? url.replace(/^https?:\/\//, '').replace(/\/c\/.*/, '/c/...'), tone: 'secondary' },
      ],
      note: isError(bound)
        ? bound.error
        : `${memberName}'s card is ready. Tap it on any phone to open their rewards, or at your counter scanner to check in.`,
    })
    setPhase('done')
    router.refresh()
  }

  async function checkCard() {
    const c = clientRef.current
    if (!c) return
    setProblem(null)
    setDone(null)
    setPhase('checking')
    setTapStarted(Date.now())
    setNow(Date.now())
    try {
      const tag = await c.call<TagRead>('frequency.read_tag', { timeout_ms: TAP_MS }, { timeoutMs: TAP_REPLY_MS })
      setTapStarted(null)
      const member = tag.kind === 'member card'
      const venue = /venue|check-?in/i.test(tag.kind ?? '')
      setDone({
        title: member ? 'MEMBER CARD' : venue ? 'CHECK-IN PLACARD' : 'TAG READ',
        lines: [
          { label: 'Kind', value: tag.kind ?? 'Unknown', tone: member || venue ? 'ok' : 'text' },
          { label: 'Chip', value: chipText(tag) },
          { label: 'Holds', value: tag.uri ? tag.uri.replace(/\/c\/.+$/, '/c/...').replace(/\?s=.+$/, '?s=...') : 'Nothing yet', tone: 'secondary' },
        ],
        note: member
          ? 'This card carries a Frequency member link.'
          : venue
            ? 'This tag carries a Space check-in link. A phone tap checks the member in.'
            : tag.uri
              ? 'Not a Frequency tag. Write a placard or a badge onto it to make it one.'
              : 'Blank. Write a placard or a badge onto it.',
      })
      setPhase('done')
    } catch (e) {
      setTapStarted(null)
      setProblem(tagProblem(e))
      if (clientRef.current) setPhase('ready')
    }
  }

  const connected = phase !== 'idle' && phase !== 'connecting'
  const ready = phase === 'ready'
  // Over Wi-Fi the board cannot be asked to probe its hat, so a read is just tried.
  const readerOk = link === 'wifi' ? connected : hat?.pn532 === true
  const version = status?.version ? `CU5K ${status.version}` : 'CU5K'
  const remaining = tapStarted === null ? 0 : Math.max(0, 1 - (now - tapStarted) / TAP_MS)
  const canMirror = client?.canMirror === true
  const showModes = phase === 'idle' || phase === 'ready'


  function selectMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    if (next === 'remote' && !client) void loadRelayDevices()
    if (next === 'update' && firmware === null) void loadFirmware()
  }

  const padOn = connected && mirror && (ready || phase === 'verify' || phase === 'done')

  // Linked over USB and idle: start the live screen. It keeps streaming through a write, so the board's own
  // "tap the sticker" screen shows here too; the client splits the screen packets from the replies.
  useEffect(() => {
    if (!wantMirror || mirror || !ready || link !== 'usb' || !canMirror || mirrorStarting.current) return
    mirrorStarting.current = true
    void startMirror().finally(() => {
      mirrorStarting.current = false
    })
    // startMirror reads the client from its ref, so it is not a dependency.
  }, [wantMirror, mirror, ready, link, canMirror])

  const release = firmware?.release ?? null
  const installed = link === 'usb' ? status?.version : undefined
  const firmwareScreen = !supported ? (
    <Screen icon="rfid" title="USE CHROME OR EDGE">
      <p>Updating the CyberUnicorn needs a USB port. Open this page in Chrome or Edge on a computer.</p>
    </Screen>
  ) : flashing && flash ? (
    <Screen icon="frequency" title="UPDATING THE UNICORN" big>
      <p>
        {flash.stage === 'download'
          ? `Downloading CU5K ${flash.version}...`
          : `Writing CU5K ${flash.version} to the CyberUnicorn. Keep the cable in and this tab open. It takes about a minute.`}
      </p>
      <p className="text-[var(--cu-secondary)]" aria-live="polite">
        {flash.stage === 'download' ? 'Downloading' : `${Math.round(flash.progress * 100)}% written`}. The Unicorn&apos;s screen shows the progress.
      </p>
    </Screen>
  ) : flash?.stage === 'done' ? (
    <Screen icon="frequency" title="UPDATE DONE" big>
      <p>CU5K {flash.version} is on the CyberUnicorn. Its Wi-Fi, its Space and its settings stayed put.</p>
      <p className="text-[var(--cu-muted)]">Unplug it for 5 seconds, plug it back in, wait for its main menu, then connect.</p>
      <div className="flex flex-wrap gap-3">
        <CuButton
          onClick={() => {
            setFlash(null)
            void connect()
          }}
        >
          Connect over USB
        </CuButton>
      </div>
    </Screen>
  ) : flash?.stage === 'failed' ? (
    <Screen icon="rfid" title="UPDATE STOPPED">
      <p className="text-[var(--cu-attention)]">{flash.message}</p>
      <p className="text-[var(--cu-muted)]">If it stopped while writing, the CyberUnicorn will not start until an update finishes. Its settings are safe. Try again.</p>
      <div className="flex flex-wrap gap-3">
        <CuButton onClick={() => setFlash(null)}>Back</CuButton>
      </div>
    </Screen>
  ) : connected && link === 'wifi' ? (
    <Screen icon="rfid" title="UPDATES GO OVER USB">
      <p>Disconnect, plug the CyberUnicorn into this computer with a USB cable, and come back here.</p>
    </Screen>
  ) : firmware === null ? (
    <Screen icon="frequency" title="CHECKING FOR UPDATES">
      <p className="text-[var(--cu-muted)]">Looking for the newest CyberUnicorn OS...</p>
    </Screen>
  ) : firmware.error ? (
    <Screen icon="rfid" title="COULD NOT CHECK">
      <p className="text-[var(--cu-attention)]">{firmware.error}</p>
      <div className="flex flex-wrap gap-3">
        <CuButton tone="secondary" onClick={() => void loadFirmware()}>
          Try again
        </CuButton>
      </div>
    </Screen>
  ) : !release ? (
    <Screen icon="frequency" title="NO UPDATE YET">
      <p>No CyberUnicorn OS release has been published yet. When one is, it shows up here.</p>
      {installed && <p className="text-[var(--cu-muted)]">This Unicorn runs CU5K {installed}.</p>}
    </Screen>
  ) : (
    <Screen icon="frequency" title={installed === release.version ? 'UP TO DATE' : 'UPDATE READY'} big>
      <dl className="space-y-1">
        <Row label="On board" value={installed ? `CU5K ${installed}` : connected ? 'Unknown' : 'Connect to see'} />
        <Row label="Newest" value={`CU5K ${release.version}`} tone="ok" />
        <Row label="Size" value={`${(release.app.size / 1048576).toFixed(1)} MB`} />
      </dl>
      <p className="text-[var(--cu-muted)]">
        Only the OS is replaced. Wi-Fi, the Space it scans for and its settings stay on the board. Installing restarts the CyberUnicorn. Pick its USB port if your browser asks.
      </p>
      <div className="flex flex-wrap gap-3">
        <CuButton onClick={() => void installFirmware(release)}>
          {installed === release.version ? 'Install again' : `Install CU5K ${release.version}`}
        </CuButton>
        {release.notesUrl && (
          <a href={release.notesUrl} target="_blank" rel="noreferrer" className="self-center text-[var(--cu-muted)] underline-offset-4 hover:text-[var(--cu-text)] hover:underline">
            What changed
          </a>
        )}
      </div>
    </Screen>
  )

  const remoteList = (
    <Screen icon="frequency" title="WI-FI REMOTE">
      <p>Drive a CyberUnicorn that is on Wi-Fi anywhere, without the cable. Its own Internet remote setting has to be on too.</p>
      {relayNote && <p className="text-[var(--cu-attention)]">{relayNote}</p>}
      {relayDevices === null ? (
        <p className="text-[var(--cu-muted)]">Looking for CyberUnicorns...</p>
      ) : relayDevices.length === 0 ? (
        !relayNote && <p className="text-[var(--cu-muted)]">No CyberUnicorns are set up yet. Set one up as a counter scanner over USB first.</p>
      ) : (
        <ul className="divide-y divide-[var(--cu-panel)] border border-[var(--cu-panel)]">
          {relayDevices.map((d) => (
            <li key={d.deviceId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--cu-text)]">{d.label}</span>
                <span className="block truncate text-[var(--cu-muted)]">
                  {d.spaceName}
                  {d.lastSeenAt ? `  seen ${new Date(d.lastSeenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                </span>
              </span>
              {d.relayEnabled ? (
                <>
                  <CuButton onClick={() => void connectRelay(d)} disabled={phase === 'connecting' || flashing}>
                    Connect
                  </CuButton>
                  <CuButton tone="quiet" onClick={() => void toggleRelay(d, false)}>
                    Turn off
                  </CuButton>
                </>
              ) : (
                <CuButton tone="secondary" onClick={() => void toggleRelay(d, true)}>
                  Turn on remote
                </CuButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        <CuButton tone="quiet" onClick={() => void loadRelayDevices()}>
          Refresh
        </CuButton>
      </div>
    </Screen>
  )

  const scenes = show?.scenes ?? []
  const remotePanel = (
    <div className="space-y-4">
      <Screen icon="frequency" title="LIGHT SHOW">
        <dl className="space-y-1">
          <Row label="Show" value={show ? (show.running ? 'Playing' : 'Stopped') : 'Unknown'} tone={show?.running ? 'ok' : 'text'} />
          {show?.scene_name && <Row label="Scene" value={show.scene_name} tone="secondary" />}
          {typeof show?.level_percent === 'number' && <Row label="Bright" value={`${show.level_percent}%`} />}
        </dl>
        <div className="flex flex-wrap gap-3">
          <CuButton onClick={() => void setLightShow({ running: !show?.running })}>{show?.running ? 'Stop' : 'Play'}</CuButton>
          {scenes.length > 1 && typeof show?.scene === 'number' && (
            <CuButton tone="secondary" onClick={() => void setLightShow({ scene: ((show.scene ?? 0) + 1) % scenes.length })}>
              Next scene
            </CuButton>
          )}
          {typeof show?.level === 'number' && typeof show.level_count === 'number' && show.level_count > 1 && (
            <CuButton tone="secondary" onClick={() => void setLightShow({ level: ((show.level ?? 0) + 1) % (show.level_count ?? 1) })}>
              Brightness
            </CuButton>
          )}
        </div>
        <p className="text-[var(--cu-dim)]">Play works from the Unicorn&apos;s main menu.</p>
      </Screen>
      <Screen icon="rfid" title="SAY HELLO">
        <p>Play a chime on the CyberUnicorn, or read the tag someone holds on it.</p>
        <div className="flex flex-wrap gap-3">
          <CuButton tone="secondary" onClick={() => void remote('sound.tone', { hz: 880, ms: 200 })}>
            Play a chime
          </CuButton>
          <CuButton tone="secondary" onClick={() => void checkCard()}>
            Read a tag
          </CuButton>
        </div>
      </Screen>
    </div>
  )

  // The board's screen shows the one progress bar while it wakes or updates (owner, 2026-10-20: "don't have
  // double loading bars"); the boot scene reads it every frame.
  const progressNow =
    flashing && flash
      ? flash.stage === 'download'
        ? { value: 0.02, text: `Downloading CU5K ${flash.version}...` }
        : { value: flash.progress, text: `Writing CU5K ${flash.version}...` }
      : phase === 'connecting'
        ? { value: bootStarted === null ? 0.05 : Math.min(1, (now - bootStarted) / 20000), text: 'Waking the Unicorn...' }
        : null
  const screenProgress = useRef<{ value: number; text: string } | null>(null)
  useEffect(() => {
    screenProgress.current = progressNow
  })
  const live = connected && link === 'usb' && mirror && client !== null
  const features: { mode: Mode; Icon: LucideIcon; label: string; count?: number }[] = [
    { mode: 'placards', Icon: Nfc, label: 'Placards' },
    { mode: 'badges', Icon: IdCard, label: 'Badges', count: requests.length },
    { mode: 'scanner', Icon: ScanLine, label: 'Scanner' },
    { mode: 'remote', Icon: Wifi, label: 'Wi-Fi remote' },
    { mode: 'update', Icon: Download, label: 'Update' },
  ]
  return (
    <section
      aria-labelledby="cu5k-title"
      style={CU_SCOPE_STYLE}
      className={`${display.variable} ${body.variable} min-w-0 font-[family-name:var(--cu-font-body)] text-[length:var(--cu-type-body)] leading-tight text-[var(--cu-text)] [--cu-radius:5px]`}
    >
      <RainbowFrame>
        {/* The top strip: drawMainBorderWithTitle()'s status line, with the Unicorn's features as its tabs. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--cu-panel)] px-4 py-2">
          <span className="flex shrink-0 items-center gap-3 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] leading-none">
            <RainbowText text={version} />
            <h2 id="cu5k-title" className="sr-only">
              CyberUnicorn, {MODE_TITLE[mode].toLowerCase()}
            </h2>
          </span>
          <nav aria-label="CyberUnicorn features" className="order-last -mx-4 -mb-2 flex min-w-0 basis-full gap-1 overflow-x-auto border-t border-[var(--cu-panel)] px-2 [scrollbar-width:none] md:order-none md:-my-2 md:mx-0 md:flex-1 md:basis-auto md:border-t-0 md:px-0">
            {features.map((f) => (
              <FeatureTab key={f.mode} Icon={f.Icon} label={f.label} count={f.count} on={mode === f.mode} onClick={() => selectMode(f.mode)} />
            ))}
          </nav>
          <span className="ml-auto flex shrink-0 gap-3 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] leading-none">
            <span className="text-[var(--cu-secondary)]">{link === 'wifi' ? 'WI-FI' : 'USB'}</span>
            {live && <span className="text-[var(--cu-primary)]">LIVE</span>}
            <span className={connected ? 'text-[var(--cu-ok)]' : 'text-[var(--cu-dim)]'}>{connected ? 'LINKED' : phase === 'connecting' ? 'WAKING' : 'NO LINK'}</span>
          </span>
        </div>

        {/* THE UNICORN FIRST (owner, 2026-10-20): its screen takes most of the frame, as big as the window's
            height allows, and the job in hand sits beside it. The screen column is sized from the height so
            the whole portal stays above the fold; the job column scrolls inside itself when it runs long. */}
        <div
          className="grid gap-5 p-4 [--cu-screen-h:clamp(15rem,calc(100dvh-21.5rem),46rem)] lg:grid-cols-[minmax(0,min(calc(var(--cu-screen-h)*4/3),64%))_minmax(0,1fr)]"
        >
          <div className="min-w-0 space-y-3">
            <div className="group relative aspect-[4/3] w-full overflow-hidden border border-[var(--cu-panel)] bg-[var(--cu-screen)]">
              {live && client ? (
                <>
                  <MirrorCanvas client={client} onKey={(k) => void press(k)} />
                  <ScreenControls
                    padOn={padOn}
                    onPress={(k) => void press(k)}
                    onRefresh={() => void refreshMirror()}
                    onOff={() => {
                      setWantMirror(false)
                      void stopMirror()
                    }}
                  />
                </>
              ) : !connected ? (
                <BootCanvas fontFamily={display.style.fontFamily} finale={phase === 'connecting'} progress={screenProgress} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
                  <Unicorn cell={6} />
                  <p className="max-w-sm text-[var(--cu-muted)]">
                    {link === 'wifi'
                      ? 'Linked over Wi-Fi. Its live screen shows here when it is on the USB cable.'
                      : !canMirror
                        ? 'The live screen needs a newer console. Reload the page.'
                        : !wantMirror
                          ? 'The live screen is off.'
                          : 'Starting the live screen...'}
                  </p>
                  {link === 'usb' && canMirror && !wantMirror && (
                    <CuButton tone="secondary" onClick={() => setWantMirror(true)} disabled={!ready}>
                      Show the screen
                    </CuButton>
                  )}
                </div>
              )}
            </div>
            {live && (
              <p className="text-[length:var(--cu-type-console)] leading-snug text-[var(--cu-dim)]">
                Use the buttons on the screen, or click it and use the arrow keys, Enter and Escape. Animated screens (the boot scene, Light Show, Spectrum) do not show here. Press Back to get to a menu.
              </p>
            )}

            {/* The Unicorn itself, under its screen: what it is, how it is linked, and the way in or out. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {connected ? (
                <>
                  <dl className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-[length:var(--cu-type-console)]">
                    <Fact label="Link" value={link === 'wifi' ? 'Wi-Fi remote' : 'USB cable'} />
                    {link === 'usb' && <Fact label="Reader" value={readerOk ? 'Ready' : 'Not found, turn DIP 3 on'} tone={readerOk ? 'ok' : 'attention'} />}
                    <Fact label="Wi-Fi" value={status?.wifi?.connected ? (status.wifi.ssid ?? 'Connected') : 'Off'} />
                  </dl>
                  {ready && link === 'usb' && !readerOk && (
                    <CuButton tone="secondary" onClick={() => void recheckReader()}>
                      Find reader
                    </CuButton>
                  )}
                  <CuButton tone="secondary" onClick={() => void checkCard()} disabled={!ready || !readerOk}>
                    Read a tag
                  </CuButton>
                  <CuButton tone="quiet" onClick={() => void disconnect()}>
                    Disconnect
                  </CuButton>
                </>
              ) : (
                <>
                  <CuButton onClick={() => void connect()} disabled={!supported || flashing || phase === 'connecting'}>
                    {phase === 'connecting' ? 'Waking...' : 'Connect USB'}
                  </CuButton>
                  <CuButton tone="secondary" onClick={() => selectMode('remote')} disabled={flashing || phase === 'connecting'}>
                    Connect Wi-Fi
                  </CuButton>
                  {flashing && <span className="min-w-0 flex-1 text-[length:var(--cu-type-console)] text-[var(--cu-secondary)]">Updating. Keep the cable in.</span>}
                </>
              )}
            </div>
          </div>

          {/* The job in hand: the feature's own screen and its fields. */}
          <div className="min-w-0 space-y-5 lg:max-h-[calc(var(--cu-screen-h)+4rem)] lg:overflow-y-auto lg:pr-1">
      <div role="status" aria-live="polite" className="space-y-4">
        {mode === 'update' ? (
          firmwareScreen
        ) : mode === 'remote' && phase === 'idle' ? (
          remoteList
        ) : !supported && link === 'usb' ? (
          <Screen icon="rfid" title="USE CHROME OR EDGE">
            <p>This browser cannot open a USB port. Open this page in Chrome or Edge on a computer.</p>
          </Screen>
        ) : phase === 'idle' ? (
          <Screen icon="rfid" title="PLUG IN THE UNICORN">
            <p>Plug the CyberUnicorn into this computer with a USB cable, then connect. Pick the USB serial port when your browser asks. You can choose the Space first.</p>
          </Screen>
        ) : phase === 'connecting' ? (
          <Screen icon="frequency" title="WAKING THE UNICORN">
            <p>Connecting restarts the CyberUnicorn. It takes about 20 seconds to come back. Leave it plugged in. Its screen shows how far along it is.</p>
          </Screen>
        ) : phase === 'working' ? (
          <Screen icon="frequency" title="WORKING ON IT">
            <p>Talking to the CyberUnicorn. Joining Wi-Fi can take up to 30 seconds.</p>
          </Screen>
        ) : phase === 'tap' || phase === 'checking' || phase === 'scanning' || phase === 'minting' ? (
          <Screen icon="frequency" title={phase === 'minting' ? 'GETTING THE LINK' : mode === 'placards' && phase === 'tap' ? 'TAP THE STICKER' : 'TAP THE CARD'} big>
            <p>
              {phase === 'minting'
                ? mode === 'placards'
                  ? `Getting ${target?.spaceName ?? 'the Space'}'s check-in link...`
                  : 'Making a card link for this member...'
                : phase === 'tap'
                  ? mode === 'placards'
                    ? `Hold the NTAG sticker flat on the CyberUnicorn reader and keep it still until it beeps. It becomes ${target?.spaceName ?? 'this Space'}'s check-in placard.`
                    : `This card is for ${cardFor ?? 'this member'}. Hold it flat on the CyberUnicorn reader and keep it still until it beeps.`
                  : phase === 'scanning'
                    ? 'Hold a member card on the reader to check them in.'
                    : 'Hold any card or tag on the reader to see what it holds.'}
            </p>
            {phase !== 'minting' && <RainbowBar value={remaining} label="Time left to tap" />}
          </Screen>
        ) : phase === 'verify' && placard ? (
          <Screen icon="frequency" title="NOW TAP IT WITH A PHONE" big>
            <p>
              The placard is written. Tap it with a phone that is signed in to Frequency. The check-in for {placard.spaceName} opens, and it shows up here the moment it lands.
            </p>
            <WaitingBar />
            <dl className="space-y-1">
              <Row label="Placard" value={placard.label} tone="secondary" />
              <Row label="Chip" value={placard.chip} />
            </dl>
            <p className="text-[var(--cu-dim)]">A phone that already checked in here today will not count again until tomorrow.</p>
            <div className="flex flex-wrap gap-3">
              <CuButton tone="secondary" onClick={skipVerify}>
                Skip the phone test
              </CuButton>
            </div>
          </Screen>
        ) : phase === 'done' && done ? (
          <Screen icon="frequency" title={done.title} big>
            <dl className="space-y-1">
              {done.lines.map((l) => (
                <Row key={l.label} label={l.label} value={l.value} tone={l.tone} />
              ))}
            </dl>
            {done.note && <p className="text-[var(--cu-muted)]">{done.note}</p>}
            <div className="flex flex-wrap gap-3">
              <CuButton
                onClick={() => {
                  setDone(null)
                  setPlacard(null)
                  setPhase('ready')
                }}
              >
                {mode === 'placards' ? 'Write another' : mode === 'badges' ? 'Program another' : 'Done'}
              </CuButton>
            </div>
          </Screen>
        ) : null}

        {notice && !problem && <p className="border border-[var(--cu-ok)] px-3 py-2 text-[var(--cu-ok)]">{notice}</p>}

        {problem && (
          <p role="alert" className="border border-[var(--cu-attention)] px-3 py-2 text-[var(--cu-attention)]">
            {problem}
          </p>
        )}
      </div>

      {showModes && CABLE_MODES.includes(mode) && connected && link === 'wifi' && (
        <Screen icon="rfid" title="USE THE CABLE FOR THIS">
          <p>Writing placards and badges and setting up a scanner only work over USB. Disconnect, plug the CyberUnicorn into this computer, and connect over USB.</p>
        </Screen>
      )}

      {mode === 'remote' && ready && link === 'wifi' && remotePanel}

      {mode === 'remote' && connected && link === 'usb' && (
        <Screen icon="rfid" title="LINKED OVER USB">
          <p>This Unicorn is on the cable, so everything works from the other features. To drive a Unicorn somewhere else over Wi-Fi, disconnect first.</p>
        </Screen>
      )}

      {showModes && CABLE_MODES.includes(mode) && !(connected && link === 'wifi') && (
        <div className="space-y-5">
          {/* Which Space: every job below works for the one chosen here. */}
          {target ? (
            <div className="flex flex-wrap items-center gap-3 border border-[var(--cu-secondary)] px-3 py-2">
              <span className={LABEL_CLASS}>Space</span>
              <span className="min-w-0 flex-1 truncate text-[var(--cu-secondary)]">{target.spaceName}</span>
              <CuButton tone="quiet" onClick={() => chooseSpace(null)}>
                Change
              </CuButton>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (spaceSlug.trim()) void findSpace()
              }}
            >
              <label className="flex-1 space-y-1">
                <span className={LABEL_CLASS}>Which Space?</span>
                <Input
                  value={spaceSlug}
                  onChange={(e) => setSpaceSlug(e.target.value)}
                  placeholder="Start typing a Space, like the-group"
                  list="cu5k-spaces"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={120}
                  className={FIELD_CLASS}
                />
              </label>
              <datalist id="cu5k-spaces">
                {spaces.map((sp) => (
                  <option key={sp.slug} value={sp.slug} label={sp.name} />
                ))}
              </datalist>
              <CuButton type="submit" tone="secondary" disabled={!spaceSlug.trim()}>
                Choose
              </CuButton>
            </form>
          )}

          {mode === 'placards' && (
            <div className="space-y-4">
              <p className="text-[var(--cu-muted)]">
                A placard is an NFC sticker with the Space&apos;s check-in link on it. Members tap it with their phone to check in and earn their Regulars stamp. NTAG213, 215 or 216 stickers work.
              </p>
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (ready && readerOk && target) void writePlacard()
                }}
              >
                <label className="flex-1 space-y-1">
                  <span className={LABEL_CLASS}>Where will it go?</span>
                  <Input
                    value={placardLabel}
                    onChange={(e) => setPlacardLabel(e.target.value)}
                    placeholder="Front door, counter, patio"
                    autoComplete="off"
                    maxLength={PLACARD_LABEL_MAX}
                    className={FIELD_CLASS}
                  />
                </label>
                <CuButton type="submit" disabled={!ready || !readerOk || !target}>
                  Write placard
                </CuButton>
              </form>
              {!target && <p className="text-[var(--cu-dim)]">Choose a Space above first.</p>}
              {target && !connected && <p className="text-[var(--cu-dim)]">Connect the Unicorn to write.</p>}
              {target && <PlacardList tags={tags} spaceName={target.spaceName} onRemove={(id) => void removeTag(id)} />}
            </div>
          )}

          {mode === 'badges' && (
            <div className="space-y-4">
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (handle.trim() && readerOk && target && ready) void program()
                }}
              >
                <label className="flex-1 space-y-1">
                  <span className={LABEL_CLASS}>Who is this card for?</span>
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="Their handle, like @maya"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={41}
                    className={FIELD_CLASS}
                  />
                </label>
                <CuButton type="submit" disabled={!handle.trim() || !readerOk || !target || !ready}>
                  Program card
                </CuButton>
              </form>
              <section aria-labelledby="cu5k-queue" className="space-y-2">
                <h4 id="cu5k-queue" className={LABEL_CLASS}>
                  Asked for a badge ({requests.length})
                </h4>
                {requests.length === 0 ? (
                  <p className="text-[var(--cu-dim)]">Nobody is waiting. Members ask from a Space&apos;s page.</p>
                ) : (
                  <ul className="divide-y divide-[var(--cu-panel)] border border-[var(--cu-panel)]">
                    {requests.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="text-[var(--cu-text)]">{r.memberName}</span>
                          {r.memberHandle && <span className="text-[var(--cu-secondary)]"> @{r.memberHandle}</span>}
                          <span className="block text-[var(--cu-muted)]">
                            {r.spaceName} · {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </span>
                        <CuButton tone="secondary" onClick={() => pick(r)}>
                          Use
                        </CuButton>
                        <CuButton tone="quiet" onClick={() => void dismiss(r.id)}>
                          Clear
                        </CuButton>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {mode === 'scanner' && (
            <div className="space-y-4">
              {ready ? (
                <ScannerSetup
                  canSetUp={caps?.includes('frequency.provision') ?? false}
                  canWifi={caps?.includes('wifi.join') ?? false}
                  config={config}
                  scanner={scanner}
                  target={target}
                  wifi={status?.wifi}
                  readerOk={readerOk}
                  networks={networks}
                  ssid={ssid}
                  password={wifiPassword}
                  onSsid={setSsid}
                  onPassword={setWifiPassword}
                  onSetUp={setUpScanner}
                  onForget={forgetScanner}
                  onFindNetworks={findNetworks}
                  onJoin={joinWifi}
                  onTest={() => void testCheckIn()}
                />
              ) : (
                <p className="text-[var(--cu-dim)]">Connect the Unicorn to make it a Space&apos;s counter scanner. Members then tap their badge on the Unicorn itself to check in.</p>
              )}
              {connected && checkIns.length > 0 && (
                <section aria-labelledby="cu5k-checkins" className="space-y-2">
                  <h4 id="cu5k-checkins" className={LABEL_CLASS}>
                    Check-ins
                  </h4>
                  <ul className="divide-y divide-[var(--cu-panel)] border border-[var(--cu-panel)]">
                    {checkIns.map((ci) => (
                      <li key={ci.at} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                        <span className={ci.ok ? 'text-[var(--cu-ok)]' : 'text-[var(--cu-attention)]'}>{ci.name}</span>
                        <span className="text-[var(--cu-muted)]">{ci.detail}</span>
                        <span className="ml-auto text-[var(--cu-dim)]">{new Date(ci.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
            {target && CABLE_MODES.includes(mode) && (
              <CuButton tone="quiet" onClick={() => chooseSpace(null)}>
                Another Space
              </CuButton>
            )}
          </div>
        </div>

        {/* The footer: the device log folds open here; the key-hint line sits on the right, grey, like the board. */}
        <div className="border-t border-[var(--cu-panel)] px-4 py-2 text-[length:var(--cu-type-console)] text-[var(--cu-muted)]">
          <details className="group/log">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase leading-none [&::-webkit-details-marker]:hidden">
              <span>{log.length > 0 ? 'Device log' : ''}</span>
              <span className="text-[var(--cu-dim)]">{connected ? 'All systems fabulous.' : 'USB 115200  DTR/RTS low'}</span>
            </summary>
            {log.length > 0 && (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-[var(--cu-floor)] p-2 font-[family-name:var(--cu-font-body)]">
                {log.join('\n').replace(/\/c\/[A-Za-z0-9_-]{16,}/g, '/c/...').replace(/\?s=v1\.[A-Za-z0-9._-]+/g, '?s=...')}
              </pre>
            )}
          </details>
        </div>
      </RainbowFrame>
    </section>
  )
}

/** One feature tab in the top strip: icon and name in the pixel face, a magenta underline when selected. */
function FeatureTab({ Icon, label, count, on, onClick }: { Icon: LucideIcon; label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={on ? 'page' : undefined}
      onClick={onClick}
      className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase leading-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--cu-secondary)] ${
        on ? 'border-[var(--cu-primary)] bg-[var(--cu-panel)] text-[var(--cu-text)]' : 'border-transparent text-[var(--cu-muted)] hover:bg-[var(--cu-floor)] hover:text-[var(--cu-text)]'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-[var(--cu-primary)]' : 'text-[var(--cu-secondary)]'}`} aria-hidden />
      {label}
      {count ? <span className="tabular-nums text-[var(--cu-warn)]">{count}</span> : null}
    </button>
  )
}

/** A fact about the linked Unicorn, under its screen. */
function Fact({ label, value, tone = 'text' }: { label: string; value: string; tone?: 'text' | 'ok' | 'attention' }) {
  const color = { text: 'text-[var(--cu-text)]', ok: 'text-[var(--cu-ok)]', attention: 'text-[var(--cu-attention)]' }[tone]
  return (
    <div className="flex gap-2">
      <dt className="text-[var(--cu-muted)]">{label}</dt>
      <dd className={color}>{value}</dd>
    </div>
  )
}

/** The board's four buttons ON its live screen (owner, 2026-10-20: "a mirrored feed with clickable controls
 *  on screen"): Back top left, the pad bottom right, refresh and off top right. Quiet until the pointer is
 *  over the screen or a button has focus, so the feed stays readable. */
function ScreenControls({ padOn, onPress, onRefresh, onOff }: { padOn: boolean; onPress: (key: NavKey) => void; onRefresh: () => void; onOff: () => void }) {
  const fade = 'opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
  return (
    <>
      <div className={`absolute left-3 top-3 ${fade}`}>
        <ScreenKey label="Back" Icon={CornerUpLeft} onClick={() => onPress('esc')} disabled={!padOn} />
      </div>
      <div className={`absolute right-3 top-3 flex gap-2 ${fade}`}>
        <ScreenKey label="Refresh the screen" Icon={RefreshCw} onClick={onRefresh} />
        <ScreenKey label="Turn the live screen off" Icon={EyeOff} onClick={onOff} />
      </div>
      <div className={`absolute bottom-3 right-3 grid grid-cols-3 gap-1.5 ${fade}`} role="group" aria-label="CyberUnicorn buttons">
        <span />
        <ScreenKey label="Previous" Icon={ChevronUp} onClick={() => onPress('prev')} disabled={!padOn} />
        <span />
        <ScreenKey label="Previous" Icon={ChevronLeft} onClick={() => onPress('prev')} disabled={!padOn} hidden />
        <ScreenKey label="Select" Icon={CircleDot} onClick={() => onPress('sel')} disabled={!padOn} primary />
        <ScreenKey label="Next" Icon={ChevronRight} onClick={() => onPress('next')} disabled={!padOn} hidden />
        <span />
        <ScreenKey label="Next" Icon={ChevronDown} onClick={() => onPress('next')} disabled={!padOn} />
        <span />
      </div>
    </>
  )
}

/** One button on the live screen: a dark glass key with a cyan edge, magenta for Select. `hidden` keeps a
 *  second way to the same key out of the tab order and the accessibility tree (left and right mirror up
 *  and down, the way the board's own menus scroll). */
function ScreenKey({ label, Icon, onClick, disabled, primary, hidden }: { label: string; Icon: LucideIcon; onClick: () => void; disabled?: boolean; primary?: boolean; hidden?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      title={label}
      className={`flex h-11 w-11 items-center justify-center outline-none backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cu-secondary)] disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-[var(--cu-primary)] text-[var(--cu-screen)] hover:bg-[var(--cu-attention)]'
          : 'border border-[var(--cu-secondary)] bg-[color-mix(in_oklab,var(--cu-screen)_70%,transparent)] text-[var(--cu-secondary)] hover:bg-[var(--cu-secondary)] hover:text-[var(--cu-screen)]'
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  )
}

/** The board's own boot scene, played in the browser while it boots (and as the idle attract loop). */
function BootCanvas({ fontFamily, finale, progress }: { fontFamily: string; finale: boolean; progress: RefObject<{ value: number; text: string } | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    return startBootScene(canvas, { fontFamily, finale, loop: true, progress: () => progress.current })
  }, [fontFamily, finale, progress])
  return (
    <canvas
      ref={ref}
      width={SCREEN_W}
      height={SCREEN_H}
      role="img"
      aria-label="The CyberUnicorn boot screen"
      className="block h-full w-full [image-rendering:pixelated]"
    />
  )
}

/** The board's screen, live: every draw call Bruce streams over the cable, painted as it arrives.
 *  Focus it and the arrow keys, Enter and Escape press the board's buttons. */
function MirrorCanvas({ client, onKey }: { client: RpcClient; onKey: (key: NavKey) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const screen = new ScreenMirror(canvas)
    screen.clear()
    return client.watchScreen((p) => screen.draw(p))
  }, [client])
  return (
    <canvas
      ref={ref}
      width={SCREEN_W}
      height={SCREEN_H}
      tabIndex={0}
      role="img"
      aria-label="The CyberUnicorn screen, live. Arrow keys move, Enter selects, Escape goes back."
      onKeyDown={(e) => {
        const key: NavKey | null =
          e.key === 'ArrowLeft' || e.key === 'ArrowUp'
            ? 'prev'
            : e.key === 'ArrowRight' || e.key === 'ArrowDown'
              ? 'next'
              : e.key === 'Enter' || e.key === ' '
                ? 'sel'
                : e.key === 'Escape' || e.key === 'Backspace'
                  ? 'esc'
                  : null
        if (!key) return
        e.preventDefault()
        onKey(key)
      }}
      className="block h-full w-full outline-none [image-rendering:pixelated] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cu-secondary)]"
    />
  )
}

/** The phone-test wait: the loader bar sweeping with no end, like the board waiting on a tap. */
function WaitingBar() {
  const t = useTick()
  return <RainbowBar value={((t % 75) + 1) / 75} label="Waiting for a phone tap" />
}

/** The chosen Space's placards, newest first. Removing one takes it off the list; the sticker keeps working. */
function PlacardList({ tags, spaceName, onRemove }: { tags: SpaceTagRow[] | null; spaceName: string; onRemove: (id: string) => void }) {
  return (
    <section aria-labelledby="cu5k-placards" className="space-y-2">
      <h4 id="cu5k-placards" className={LABEL_CLASS}>
        {spaceName} placards{tags ? ` (${tags.length})` : ''}
      </h4>
      {tags === null ? (
        <p className="text-[var(--cu-dim)]">Loading...</p>
      ) : tags.length === 0 ? (
        <p className="text-[var(--cu-dim)]">None yet. Write the first one.</p>
      ) : (
        <ul className="divide-y divide-[var(--cu-panel)] border border-[var(--cu-panel)]">
          {tags.map((tag) => (
            <li key={tag.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="text-[var(--cu-text)]">{tag.label || 'Check-in placard'}</span>
                <span className="block text-[var(--cu-muted)]">
                  {[tag.chipType, tag.uid].filter(Boolean).join('  ') || 'Chip unknown'} · {new Date(tag.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {tag.writtenBy ? ` · ${tag.writtenBy}` : ''}
                </span>
              </span>
              <CuButton tone="quiet" onClick={() => onRemove(tag.id)}>
                Remove
              </CuButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One device screen: an icon, a rainbow title, and its content. */
function Screen({ icon, title, big, children }: { icon: keyof typeof CU_ICONS; title: string; big?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Icon name={icon} cell={big ? 3 : 2} />
      <div className="min-w-0 flex-1 space-y-3">
        <RainbowText as="p" text={title} className="font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-2)] leading-snug" />
        {children}
      </div>
    </div>
  )
}

// Important (`!`) on purpose: the site skin's `.input` rule paints the field white with its own font and
// radius after the utilities, and this field has to wear the Unicorn's colours instead.
const FIELD_CLASS =
  'block min-h-11 w-full rounded-none! border! border-[var(--cu-secondary)]! bg-[var(--cu-floor)]! px-3! py-1! font-[family-name:var(--cu-font-body)]! text-[length:var(--cu-type-body)]! text-[var(--cu-text)]! shadow-none! caret-[var(--cu-primary)] outline-none ring-0 placeholder:text-[var(--cu-dim)] focus-visible:border-[var(--cu-primary)]! focus-visible:ring-0'

/** The board-as-counter-scanner block: which Space it answers for, how its scans travel, Wi-Fi. */
function ScannerSetup(props: {
  canSetUp: boolean
  canWifi: boolean
  config: FrequencyConfig | null
  scanner: Scanner | null
  target: Target | null
  wifi: SystemStatus['wifi']
  readerOk: boolean
  networks: WifiNetwork[] | null
  ssid: string
  password: string
  onSsid: (v: string) => void
  onPassword: (v: string) => void
  onSetUp: () => void
  onForget: () => void
  onFindNetworks: () => void
  onJoin: () => void
  onTest: () => void
}) {
  const { config, scanner, target, wifi } = props
  const ready = config?.ready === true
  const revoked = scanner?.active === false
  const sameSpace = ready && !revoked && scanner?.spaceId === target?.spaceId
  const scannerText = !props.canSetUp
    ? 'This firmware cannot be set up over USB. Update it.'
    : !ready
      ? 'Not set up'
      : revoked
        ? 'Revoked. Set it up again.'
        : scanner
          ? `${scanner.spaceName}, ${scanner.label}`
          : 'Set up for a scanner this site does not know'
  const route = !ready
    ? null
    : wifi?.connected
      ? `Over Wi-Fi (${wifi.ssid ?? 'connected'})`
      : config?.cable
        ? 'Through this computer'
        : config?.clock_set === false
          ? 'Waiting for the board clock. Reconnect it.'
          : 'Saved on the board until it is online'
  const selected = props.networks?.find((n) => n.ssid === props.ssid)
  return (
    <section aria-labelledby="cu5k-scanner" className="space-y-3 border-t border-[var(--cu-panel)] pt-4">
      <h4 id="cu5k-scanner" className="font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]">
        Counter scanner
      </h4>
      <dl className="space-y-1">
        <Row label="Scanner" value={scannerText} tone={ready && !revoked && scanner ? 'ok' : 'attention'} />
        {route && <Row label="Scans" value={config?.queued ? `${route}. ${config.queued} waiting to send.` : route} tone="secondary" />}
        {props.canWifi && <Row label="Wi-Fi" value={wifi?.connected ? `${wifi.ssid ?? 'Connected'}${wifi.ip ? `  ${wifi.ip}` : ''}` : 'Not connected'} />}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        {props.canSetUp && target && !sameSpace && (
          <CuButton tone="secondary" onClick={props.onSetUp}>
            {ready && !revoked ? `Switch to ${target.spaceName}` : `Make it ${target.spaceName}'s scanner`}
          </CuButton>
        )}
        {ready && !revoked && props.readerOk && (
          <CuButton tone="secondary" onClick={props.onTest}>
            Test a check-in
          </CuButton>
        )}
        {props.canWifi && (
          <CuButton tone="quiet" onClick={props.onFindNetworks}>
            {wifi?.connected ? 'Change Wi-Fi' : 'Join Wi-Fi'}
          </CuButton>
        )}
        {props.canSetUp && config?.device_id && (
          <CuButton tone="quiet" onClick={props.onForget}>
            Forget setup
          </CuButton>
        )}
      </div>
      {props.canSetUp && !target && !ready && <p className="text-[var(--cu-dim)]">Choose a Space above to make this board its counter scanner.</p>}
      {props.networks && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            props.onJoin()
          }}
        >
          <label className="flex-1 space-y-1">
            <span className="block font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]">Network</span>
            <Select
              value={props.ssid}
              onChange={(e) => props.onSsid(e.target.value)}
              className={FIELD_CLASS}
              emptyLabel={props.networks.length === 0 ? 'No networks found' : undefined}
              options={props.networks.map((n) => ({
                value: n.ssid ?? '',
                label: `${n.ssid}${n.auth === 'open' ? ' (open)' : ''}${n.saved ? ' (saved)' : ''}`,
              }))}
            />
          </label>
          {selected?.auth !== 'open' && (
            <label className="flex-1 space-y-1">
              <span className="block font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]">Password</span>
              <Input
                type="password"
                value={props.password}
                onChange={(e) => props.onPassword(e.target.value)}
                placeholder={selected?.saved ? 'Saved on the board' : 'Wi-Fi password'}
                autoComplete="off"
                maxLength={63}
                className={FIELD_CLASS}
              />
            </label>
          )}
          <CuButton type="submit" tone="secondary" disabled={!props.ssid}>
            Join
          </CuButton>
        </form>
      )}
    </section>
  )
}
