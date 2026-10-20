'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Press_Start_2P, VT323 } from 'next/font/google'
import { Input } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { cancelConsoleCard, finishConsoleCard, startConsoleCard } from '@/lib/devices/actions'
import { dismissBadgeRequest, lookupConsoleSpace } from '@/lib/devices/badge-actions'
import type { BadgeRequestRow } from '@/lib/devices/badges'
import { RpcClient, DeviceError } from '@/lib/device/client'
import { openWebSerial, pickPort, rememberedPort, webSerialAvailable } from '@/lib/device/web-serial'
import type { HatProbe, SystemStatus, TagRead, TagWritten } from '@/lib/device/types'
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

// THE CYBERUNICORN CONSOLE (build plan phases 1 to 3, docs/LOYALTY.md section 7 "Counter scanners"). Plug
// the CyberUnicorn 5000 into this computer, hold a card to its reader, and this panel writes a member
// card for THIS Space over USB (Web Serial, Chrome or Edge). The wire is the device's remote protocol v1
// (lib/device/, cyberpunkunicorn-os/apps/remote/PROTOCOL.md): `system.status`, `hat.probe`,
// `frequency.write_tag` and `frequency.read_tag`. The card itself is minted server-side by owner-gated
// actions (lib/devices/actions.ts): mint, write, then bind the chip, or discard the mint if the device
// says the write failed.
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
      className="block shrink-0 [image-rendering:pixelated]"
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
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'primary' | 'secondary' | 'quiet'
  type?: 'button' | 'submit'
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
      className={`min-h-11 px-4 py-2 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase leading-none tracking-normal outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cu-secondary)] disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[var(--cu-muted)] disabled:opacity-60 ${tones[tone]}`}
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

type Phase = 'idle' | 'connecting' | 'ready' | 'minting' | 'tap' | 'checking' | 'done'

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

export function CyberUnicornConsole({ requests, spaces }: { requests: BadgeRequestRow[]; spaces: { slug: string; name: string }[] }) {
  const router = useRouter()
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => webSerialAvailable(),
    () => true,
  )
  const clientRef = useRef<RpcClient | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
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
  const [target, setTarget] = useState<Target | null>(null)
  const [spaceSlug, setSpaceSlug] = useState('')

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
    setPhase('idle')
    setStatus(null)
    setHat(null)
    setTapStarted(null)
    await c?.close().catch(() => undefined)
  }, [])

  // Let go of the port when the page goes away or the tab is hidden while nothing is in flight, so a
  // flash or another tool can open it. Connecting again always takes a click (it reboots the board).
  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = phase === 'connecting' || phase === 'minting' || phase === 'tap' || phase === 'checking'
  }, [phase])
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

  async function connect() {
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
      const client = new RpcClient(transport)
      clientRef.current = client
      client.log.on((l) => setLog((prev) => [...prev.slice(-39), `${l.dir === 'out' ? '>' : l.dir === 'in' ? '<' : '#'} ${l.text}`]))
      client.events.on((e) => {
        if (e.event === 'frequency.waiting_for_tag') {
          setTapStarted(Date.now())
          setNow(Date.now())
        }
      })
      transport.onClose((reason) => {
        if (clientRef.current !== client) return
        clientRef.current = null
        setPhase('idle')
        setStatus(null)
        setHat(null)
        setTapStarted(null)
        setProblem(`${reason} Plug the CyberUnicorn back in and connect.`)
      })

      // Opening the port reboots the board (measured: the CH340 driver on macOS pulses EN however the page
      // sets DTR and RTS), and it reads nothing until its setup ends, about 18 s later. Ask every few
      // seconds until a status comes back. Pings sent during boot are answered late and ignored by id.
      let s: SystemStatus | null = null
      const until = Date.now() + BOOT_WAIT_MS
      setBootStarted(Date.now())
      while (!s && Date.now() < until && clientRef.current === client) {
        s = await client.call<SystemStatus>('system.status', {}, { timeoutMs: 3000 }).catch(() => null)
      }
      setBootStarted(null)
      if (!s) {
        await disconnect()
        setProblem('The CyberUnicorn did not answer. Wait for it to finish booting, then connect again. If it still says nothing, it needs the CyberUnicorn OS build with the remote app.')
        return
      }
      setStatus(s)
      setHat(await client.call<HatProbe>('hat.probe').catch(() => null))
      setPhase('ready')
    } catch (e) {
      await disconnect()
      setProblem(e instanceof Error ? e.message : 'Could not connect.')
    }
  }

  // DIP 3 can be flipped after connecting, so the reader can be looked for again without a reconnect (a reboot).
  async function recheckReader() {
    const client = clientRef.current
    if (!client) return
    setProblem(null)
    setHat(await client.call<HatProbe>('hat.probe').catch(() => null))
  }

  // A request in the queue fills in who and where; Program then writes it.
  function pick(r: BadgeRequestRow) {
    setProblem(null)
    setDone(null)
    setTarget({ spaceId: r.spaceId, spaceName: r.spaceName })
    setHandle(r.memberHandle ? `@${r.memberHandle}` : '')
  }

  async function findSpace() {
    setProblem(null)
    const found = await lookupConsoleSpace(spaceSlug)
    if (isError(found)) {
      setProblem(found.error)
      return
    }
    setTarget({ spaceId: found.data.id, spaceName: found.data.name })
  }

  async function dismiss(id: string) {
    const out = await dismissBadgeRequest(id)
    if (isError(out)) setProblem(out.error)
    else router.refresh()
  }

  async function program() {
    const client = clientRef.current
    if (!client || !target) return
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
      tag = await client.call<TagWritten>(
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
        { label: 'Chip', value: [tag.type, tag.uid].filter(Boolean).join('  ') || 'Unknown' },
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
    const client = clientRef.current
    if (!client) return
    setProblem(null)
    setDone(null)
    setPhase('checking')
    setTapStarted(Date.now())
    setNow(Date.now())
    try {
      const tag = await client.call<TagRead>('frequency.read_tag', { timeout_ms: TAP_MS }, { timeoutMs: TAP_REPLY_MS })
      setTapStarted(null)
      const member = tag.kind === 'member card'
      setDone({
        title: member ? 'MEMBER CARD' : 'TAG READ',
        lines: [
          { label: 'Kind', value: tag.kind ?? 'Unknown', tone: member ? 'ok' : 'text' },
          { label: 'Chip', value: [tag.type, tag.uid].filter(Boolean).join('  ') || 'Unknown' },
          { label: 'Holds', value: tag.uri ? tag.uri.replace(/\/c\/.+$/, '/c/...') : 'Nothing yet', tone: 'secondary' },
        ],
        note: member ? 'This card carries a Frequency member link.' : tag.uri ? 'Not a member card. Program it to make it one.' : 'Blank. Program it to make it a member card.',
      })
      setPhase('done')
    } catch (e) {
      setTapStarted(null)
      setProblem(tagProblem(e))
      if (clientRef.current) setPhase('ready')
    }
  }

  const connected = phase !== 'idle' && phase !== 'connecting'
  const readerOk = hat?.pn532 === true
  const version = status?.version ? `CU5K ${status.version}` : 'CU5K'
  const remaining = tapStarted === null ? 0 : Math.max(0, 1 - (now - tapStarted) / TAP_MS)

  return (
    <section
      aria-labelledby="cu5k-title"
      style={CU_SCOPE_STYLE}
      className={`${display.variable} ${body.variable} font-[family-name:var(--cu-font-body)] text-[length:var(--cu-type-body)] leading-tight text-[var(--cu-text)] [--cu-radius:5px]`}
    >
      <RainbowFrame>
        {/* Status bar: drawMainBorderWithTitle()'s top strip. */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--cu-panel)] px-3 py-2 font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] leading-none">
          <RainbowText text={version} />
          <span className="flex gap-3">
            <span className="text-[var(--cu-secondary)]">USB</span>
            <span className={connected ? 'text-[var(--cu-ok)]' : 'text-[var(--cu-dim)]'}>{connected ? 'LINKED' : 'NO LINK'}</span>
          </span>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          <header className="flex items-center gap-4">
            <Unicorn cell={2} />
            <div className="min-w-0 space-y-2">
              <h3 id="cu5k-title" className="font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-2)] leading-snug">
                <RainbowText text="CYBERUNICORN 5000" />
                <sup className="ml-1 align-super text-[length:var(--cu-type-1)] text-[var(--cu-muted)]">TM</sup>
              </h3>
              <p className="text-[var(--cu-muted)]">Program scannable member badges over USB.</p>
            </div>
          </header>

          <div role="status" aria-live="polite" className="space-y-4">
            {!supported ? (
              <Screen icon="rfid" title="USE CHROME OR EDGE">
                <p>This browser cannot open a USB port. Open this page in Chrome or Edge on a computer.</p>
              </Screen>
            ) : phase === 'idle' ? (
              <Screen icon="rfid" title="PLUG IN THE UNICORN">
                <p>Plug the CyberUnicorn into this computer with a USB cable, then connect. Pick the USB serial port when your browser asks.</p>
                <CuButton onClick={connect}>Connect over USB</CuButton>
              </Screen>
            ) : phase === 'connecting' ? (
              <Screen icon="frequency" title="WAKING THE UNICORN">
                <p>Connecting restarts the CyberUnicorn. It takes about 20 seconds to come back. Leave it plugged in.</p>
                <RainbowBar value={bootStarted === null ? 0.05 : Math.min(1, (now - bootStarted) / 20000)} label="Waking the CyberUnicorn" />
                <p className="text-[var(--cu-muted)]">Reticulating rainbows...</p>
              </Screen>
            ) : phase === 'tap' || phase === 'checking' || phase === 'minting' ? (
              <Screen icon="frequency" title={phase === 'minting' ? 'MAKING THE CARD' : 'TAP THE CARD'} big>
                <p>
                  {phase === 'minting'
                    ? 'Making a card link for this member...'
                    : phase === 'tap'
                      ? `This card is for ${cardFor ?? 'this member'}. Hold it flat on the CyberUnicorn reader and keep it still until it beeps.`
                      : 'Hold any card or tag on the reader to see what it holds.'}
                </p>
                {phase !== 'minting' && <RainbowBar value={remaining} label="Time left to tap the card" />}
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
                      setPhase('ready')
                    }}
                  >
                    Program another
                  </CuButton>
                </div>
              </Screen>
            ) : null}

            {problem && (
              <p role="alert" className="border border-[var(--cu-attention)] px-3 py-2 text-[var(--cu-attention)]">
                {problem}
              </p>
            )}
          </div>

          {phase === 'ready' && (
            <div className="space-y-4">
              <dl className="space-y-1">
                <Row label="Device" value={[status?.os ?? 'CyberUnicorn', status?.version].filter(Boolean).join(' ')} />
                <Row
                  label="Reader"
                  value={readerOk ? (hat?.summary ?? 'PN532 ready') : 'Not found. Turn DIP 3 ON, then look again.'}
                  tone={readerOk ? 'ok' : 'attention'}
                />
              </dl>
              {target ? (
                <dl className="space-y-1">
                  <Row label="Space" value={target.spaceName} tone="secondary" />
                </dl>
              ) : (
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (spaceSlug.trim()) void findSpace()
                  }}
                >
                  <label className="flex-1 space-y-1">
                    <span className="block font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]">
                      Which Space?
                    </span>
                    <Input
                      value={spaceSlug}
                      onChange={(e) => setSpaceSlug(e.target.value)}
                      placeholder="Start typing a Space, like the-group"
                      list="cu5k-spaces"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={120}
                      className="block min-h-11 w-full rounded-none border border-[var(--cu-secondary)] bg-[var(--cu-floor)] px-3 py-1 font-[family-name:var(--cu-font-body)] text-[length:var(--cu-type-body)] text-[var(--cu-text)] shadow-none caret-[var(--cu-primary)] outline-none ring-0 placeholder:text-[var(--cu-dim)] focus-visible:border-[var(--cu-primary)] focus-visible:ring-0"
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
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (handle.trim() && readerOk && target) void program()
                }}
              >
                <label className="flex-1 space-y-1">
                  <span className="block font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]">
                    Who is this card for?
                  </span>
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="Their handle, like @maya"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={41}
                    className="block min-h-11 w-full rounded-none border border-[var(--cu-secondary)] bg-[var(--cu-floor)] px-3 py-1 font-[family-name:var(--cu-font-body)] text-[length:var(--cu-type-body)] text-[var(--cu-text)] shadow-none caret-[var(--cu-primary)] outline-none ring-0 placeholder:text-[var(--cu-dim)] focus-visible:border-[var(--cu-primary)] focus-visible:ring-0"
                  />
                </label>
                <CuButton type="submit" disabled={!handle.trim() || !readerOk || !target}>
                  Program card
                </CuButton>
              </form>
              <div className="flex flex-wrap items-center gap-3">
                {readerOk ? (
                  <CuButton tone="secondary" onClick={checkCard}>
                    Check a card
                  </CuButton>
                ) : (
                  <CuButton tone="secondary" onClick={recheckReader}>
                    Look for the reader
                  </CuButton>
                )}
                {target && (
                  <CuButton tone="quiet" onClick={() => setTarget(null)}>
                    Change Space
                  </CuButton>
                )}
                <CuButton tone="quiet" onClick={disconnect}>
                  Disconnect
                </CuButton>
              </div>
            </div>
          )}

          {(phase === 'idle' || phase === 'ready') && (
            <section aria-labelledby="cu5k-queue" className="space-y-2">
              <h4 id="cu5k-queue" className="font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase text-[var(--cu-muted)]">
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
                      <CuButton tone="secondary" onClick={() => pick(r)} disabled={phase !== 'ready'}>
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
          )}

          {log.length > 0 && (
            <details className="text-[length:var(--cu-type-console)] text-[var(--cu-muted)]">
              <summary className="cursor-pointer font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase">Device log</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-[var(--cu-floor)] p-2 font-[family-name:var(--cu-font-body)]">
                {log.join('\n').replace(/\/c\/[A-Za-z0-9_-]{16,}/g, '/c/...')}
              </pre>
            </details>
          )}
        </div>

        {/* Key-hint footer, grey size 1, like the device. */}
        <p className="border-t border-[var(--cu-panel)] px-3 py-2 text-center font-[family-name:var(--cu-font-display)] text-[length:var(--cu-type-1)] uppercase leading-none text-[var(--cu-dim)]">
          {connected ? 'All systems fabulous.' : 'USB 115200  DTR/RTS low'}
        </p>
      </RainbowFrame>
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
