'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- a straight port of the Theme Kits design file's Component class (design_handoff_theme_kits/Theme Kits.dc.html). */
// The Theme Kits page's state and view model (LIVE-2188): which accent each kit wears, the look filter, which device sits in front
// of each kit's cloud, the full-size view, and the hero cloud's parallax and click-to-zoom. The shapes it returns are what the
// design's template reads, so the view (kit-showcase-view.tsx) stays the design's own markup.
import { useCallback, useEffect, useState } from 'react'
import { rememberKit } from '@/lib/create-space/last-kit'
import { themePagePath } from '@/lib/themes/library'
import { myThemeAction } from '@/app/(marketing)/themes/actions'
import { READY_FILTERS, REGISTER_FILTERS, kitFacts, kitMatches, type ReadyFilter, type RegisterFilter } from './filters'
import { useCyberWitchPick, writeAccent as writeCyberWitchAccent } from '../cyberwitch-accent'
import { FILTERS, LAY, SPD, SURF, THEMES, type Any } from './data'
import { BASE, SKIN, lum, onA, resolveDeco } from './skins'

export interface ShowcaseLinks {
  /** Where "Start free" goes: the 12 minute launch, or the builder while the launch is off. */
  start: string
  plans: string
  /** Per design kit id: where "Use <kit>" goes, and the kit's own page (null when it has none yet). */
  kits: Record<string, { use: string | null; page: string | null; /** The builder's kit id, for rememberKit() (lib/create-space/last-kit.ts) when this kit's section is in view. */ kit: string | null; /** The Mega Theme id behind this design kit (its manifest), or null. */ theme: string | null }>
}

const SN: Record<string, string> = { website: 'Website', email: 'Email', spotlight: 'Spotlight', space: 'Space page' }
const DEV: Record<string, string> = { website: 'laptop', email: 'tablet', spotlight: 'iPhone', space: 'iPad' }
const RT: Record<string, number> = { isLap: 0.68, isPad: 0.65, isLivePad: 0.65, isTab: 1.3, isPhone: 2.13 }
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

const shot = (th: Any, a: Any, key: string) =>
  a.set ? `/themes-index/s/accent/${a.set}${key}.webp` : `/themes-index/s/themes/${th.dir}/shots/${a.id}-${key}.webp`

/** A Use address with the picked accent added (?accent=<name>, lib/create-space/door.ts). Only a kit's own Use link
 *  carries one; null stays null. */
function withAccent(href: string | null, accent: string | undefined): string | null {
  if (!href || !accent || !/^[a-z0-9 -]{1,40}$/i.test(accent)) return href
  return `${href}${href.includes('?') ? '&' : '?'}accent=${encodeURIComponent(accent.toLowerCase())}`
}

export function useKitShowcase(props: { heroKit?: string; alternate?: boolean; links: ShowcaseLinks }) {
  const [acc, setAcc] = useState<Record<string, number>>({})
  // CyberWitch's neon is one pick on this device: the theme page's dial and this section read and write the same one.
  const cwPick = useCyberWitchPick()
  const [filter, setFilter] = useState('all')
  const [register, setRegister] = useState<RegisterFilter>('all')
  const [ready, setReady] = useState<ReadyFilter>('all')
  // The theme the signed-in person's own site wears (null signed out, or until the read lands): the "your site" chip.
  const [mine, setMine] = useState<{ theme: string; slug: string } | null>(null)
  useEffect(() => {
    let on = true
    myThemeAction().then((m) => { if (on) setMine(m) }).catch(() => {})
    return () => { on = false }
  }, [])
  const [lb, setLb] = useState<{ id: string; surf: string } | null>(null)
  const [feat, setFeat] = useState<Record<string, any>>({})
  const [left, setLeft] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLb(null)
    }
    window.addEventListener('keydown', onKey)
    let raf = 0
    const onMove = (e: MouseEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const cl = document.querySelector('[data-hcloud]')
        if (!cl) return
        const r = cl.getBoundingClientRect()
        if (e.clientY > r.bottom + 240 || r.bottom < 0) return
        const mx = Math.max(-0.7, Math.min(0.7, (e.clientX - r.left) / r.width - 0.5))
        const my = Math.max(-0.7, Math.min(0.7, (e.clientY - r.top) / r.height - 0.5))
        cl.querySelectorAll<HTMLElement>('[data-hdev]').forEach((el) => {
          const d = +(el.dataset.hdev ?? 1) || 1
          const b = el.getBoundingClientRect()
          const cx = (b.left + b.width / 2 - r.left) / r.width - 0.5
          const cy = (b.top + b.height / 2 - r.top) / r.height - 0.5
          const dx = cx - mx
          const dy = cy - my
          const dist = Math.hypot(dx, dy) + 0.18
          const push = Math.min(26, 9 / dist)
          el.style.translate = `${(-mx * d * 7 + (dx / dist) * push).toFixed(1)}px ${(-my * d * 6 + (dy / dist) * push).toFixed(1)}px`
          el.style.rotate = `${(mx * (d % 2 ? 1 : -1) * d * 0.35).toFixed(2)}deg`
        })
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    const onOutside = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-hdev]')) return
      setFeat((s) => (s.hero === undefined ? s : { ...s, hero: undefined }))
    }
    document.addEventListener('click', onOutside)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('click', onOutside)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const heroFeat = useCallback((n: number | undefined) => {
    setLeft(false)
    setFeat((s) => ({ ...s, hero: n }))
  }, [])
  // The kit whose section holds the middle of the window is the last kit looked at: the 12 minute launch starts from it.
  // A kit the builder does not offer has a null kit and is skipped.
  const linkKits = props.links.kits
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const kit = linkKits[e.target.id.replace(/^kit-/, '')]?.kit
          if (kit) rememberKit(kit)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    document.querySelectorAll('[id^="kit-"]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [linkKits])
  const holdHero = useCallback(() => setLeft(false), [])
  const releaseHero = useCallback(() => setLeft(true), [])
  // A device brought to the front stays up while hovered, and goes back 1.4s after the mouse leaves it.
  const heroOn = feat.hero !== undefined
  useEffect(() => {
    if (!heroOn || !left) return
    const t = setTimeout(() => heroFeat(undefined), 1400)
    return () => clearTimeout(t)
  }, [heroOn, left, heroFeat])

  /** The accent a kit wears: the one picked here, else (CyberWitch) the device's neon, else the kit's first. */
  const accAt = (th: Any): number => {
    if (acc[th.id] !== undefined) return acc[th.id]
    const cw = th.id === 'cyberwitch' && cwPick ? th.accents.findIndex((x: Any) => x.id === cwPick) : -1
    return cw >= 0 ? cw : 0
  }
  const build = (th: Any, i: number, total: number) => {
    const ai = accAt(th)
    const a = th.accents[ai]
    const A = a.hex
    const T = a.text || a.hex
    const shots = !!th.dir
    const img: Record<string, string> = {}
    SURF.forEach((s) => {
      if (shots) img[s[0]] = shot(th, a, s[3])
    })
    const featNow = feat[th.id] || 'website'
    const L = (LAY as Any)[featNow]
    const pos: Any = {}
    const click: Any = {}
    const open: Any = {}
    SURF.forEach((s) => {
      open[s[0]] = shots || s[0] === 'space' ? () => setLb({ id: th.id, surf: s[0] }) : undefined
    })
    SURF.forEach(([s]) => {
      const v = L[s]
      const on = s === featNow
      pos[s] = {
        l: v[0] + '%',
        t: v[1] + '%',
        w: v[2] + '%',
        z: String(v[3]),
        cur: on ? (shots || s === 'space' ? 'zoom-in' : 'default') : 'pointer',
        f: on ? 'none' : 'saturate(.9) brightness(.93)',
      }
      click[s] = on ? open[s] : () => setFeat((st) => ({ ...st, [th.id]: s }))
    })
    const sk = Object.assign({}, BASE, { mockNavF: '500 1.35cqw/1 sans-serif', mockEyeF: '600 1.2cqw/1 sans-serif', mockEyeColor: T, mockH: '6.4cqw' }, (SKIN as Any)[th.id](A, T, a))
    const t = Object.assign({}, th.t)
    const biz = th.biz
      ? Object.assign({}, th.biz, {
          list: (th.biz.offers || []).map((o: string[], j: number) => ({ n: o[0], p: o[1], m: o[2] + ' · ' + o[1], i: th.id === 'wildheart' ? ['I', 'II', 'III'][j] : '0' + (j + 1) })),
          doors: th.biz.offers
            ? [
                { k: 'Book', n: th.biz.offers[0][0] },
                { k: 'Next up', n: 'What’s happening' },
                { k: 'Join', n: th.biz.offers[2][0] },
                { k: 'The letter', n: 'Once a month' },
              ]
            : [],
        })
      : undefined
    const facts = kitFacts(th, props.links.kits[th.id]?.theme ?? null)
    const readyCount = SURF.filter((s) => facts.ready[s[0] as keyof typeof facts.ready]).length
    const d = (SPD as Any)[th.id]
    const sp = {
      photo: th.id === 'cyberwitch' ? `/themes-index/cyberwitch/hero-${a.id}.webp` : d[0].startsWith('/') ? d[0] : '/themes-index/photos/' + d[0],
      next: d[1],
      meta: d[2],
      about: d[3],
      site: th.label.toLowerCase().replace(/[^a-z]/g, '') + '.space',
      on: onA(A, '#1E1B18', '#FFFFFF'),
      nameSize: ({ bold: '6.4cqw', cyberwitch: '5.6cqw', services: '5.6cqw' } as Any)[th.id] || '5cqw',
    }
    const link = props.links.kits[th.id]
    return {
      ...th,
      facts,
      biz,
      pos,
      click,
      feat: featNow,
      num: String(i + 1).padStart(2, '0'),
      total: String(total).padStart(2, '0'),
      shots,
      mock: !shots,
      sp,
      img,
      open,
      t,
      sk,
      accent: A,
      accentText: T,
      accentLabel: a.label,
      accentMeaning: a.meaning || '',
      glow: A + '2B',
      // The accent picked here rides the Use button, so the builder (and the Space it makes) starts on it.
      useHref: link ? withAccent(link.use, typeof a.hex === 'string' ? a.hex.replace('#', '') : a.id || a.label) : props.links.start,
      kitHref: link?.page ?? null,
      mailBg: th.mailBg || th.t.bg,
      mailW: th.id === 'new-world' ? '150%' : '100%',
      mailMask: th.fullMail ? 'linear-gradient(#000 74%,transparent 94%)' : 'none',
      mailFoot: !!th.fullMail,
      stats: [
        { v: String(th.kits), k: 'Starter kits' },
        { v: readyCount + '/4', k: 'Surfaces ready' },
        { v: String(th.accents.length), k: 'Accents' },
      ],
      accentList: th.accents.map((x: Any, j: number) => ({
        hex: x.hex,
        label: x.label,
        pressed: j === ai ? 'true' : 'false',
        ring: j === ai ? `0 0 0 3px ${th.t.bg},0 0 0 5px ${x.hex}` : `inset 0 0 0 1px ${lum(th.t.bg) > 0.4 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.22)'}`,
        heroRing: j === ai ? `0 0 0 3px #0A0612,0 0 0 5px ${x.hex}` : 'inset 0 0 0 1px rgba(255,255,255,.25)',
        onClick: () => {
          setAcc((s) => ({ ...s, [th.id]: j }))
          if (th.id === 'cyberwitch' && x.id) writeCyberWitchAccent(x.id)
        },
      })),
      surfaces: SURF.map((s) => {
        const r = facts.ready[s[0] as keyof typeof facts.ready]
        return {
          name: s[1],
          device: s[2],
          stateLabel: r ? 'Ready' : 'On the way',
          stateColor: r ? sk.text : sk.muted,
          dot: r ? A : 'transparent',
          dotRing: r ? `0 0 6px ${A}66` : `inset 0 0 0 1.5px ${sk.muted}`,
          onClick: click[s[0]],
          chipBg: s[0] === featNow ? 'rgba(127,127,127,.14)' : 'transparent',
        }
      }),
    }
  }

  const N = THEMES.length
  const all = THEMES.map((th, i) => build(th, i, N))
  const scenes = all.filter((th) => (filter === 'all' || th.reg === filter || th.temp === filter) && kitMatches(th.facts, { register, ready }))
  scenes.forEach((th, i) => {
    ;(th as Any).textOrder = (props.alternate ?? true) && i % 2 === 1 ? 2 : 0
    const a = th.accents[accAt(th)]
    ;(th as Any).dk = resolveDeco(th.id, a.hex, a, (th as Any).textOrder === 2)
  })
  const byId = (id: string) => all.find((x) => x.id === id)
  const heroKitId = byId(props.heroKit ?? 'new-world')?.shots ? (props.heroKit ?? 'new-world') : 'new-world'
  const MIX = { website: heroKitId }
  const P = '/themes-index/s/accent/'
  const HD: Any[] = [
    ['designer', 'website', 'isLap', [0, 0, 32, 1]],
    ['wildheart', 'space', 'isPad', [66, 0, 34, 1]],
    [MIX.website, 'website', 'isLap', [20, 10, 56, 3]],
    ['network', 'spotlight', 'isPhone', [2, 34, 12, 6]],
    ['temple', 'email', 'isTab', [12, 66, 17, 5]],
    ['cyberwitch', 'website', 'isLivePad', [30, 66, 38, 4]],
    ['nocturne', 'spotlight', 'isPhone', [70, 30, 12.5, 6]],
    ['new-world', 'spotlight', 'isPhone', [86, 36, 12, 5], P + 'new-world-magenta-spot.webp', 'Magenta'],
    ['network', 'email', 'isTab', [70, 70, 16, 5]],
    ['new-world', 'email', 'isTab', [86, 74, 14, 4], P + 'new-world-sun-email.webp', 'Sun'],
  ]
  const base = byId(MIX.website) as Any
  const hf = feat.hero as number | undefined
  const devs = HD.map(([id, s, kind, v, ov, accName]: Any, n: number) => {
    const k = byId(id) as Any
    const on = hf === n
    const hU = v[2] * RT[kind]
    const cy = v[1] * 0.76 + hU / 2
    const sc = Math.min(2.4, 74 / hU, 84 / v[2])
    const zx = (((50 - (v[0] + v[2] / 2)) / v[2]) * 100).toFixed(1)
    const zy = (((38 - cy) / hU) * 100).toFixed(1)
    const name = SN[s]
    return {
      [kind]: true,
      depth: String(v[3]),
      on: true,
      k,
      img: ov || (k.img ? k.img[s] : ''),
      id,
      alt: k.label + ' ' + name,
      mailBg: k.mailBg,
      mailW: k.mailW,
      mailMask: k.mailMask,
      accent: k.accent,
      l: v[0] + '%',
      t: v[1] + '%',
      w: v[2] + '%',
      z: on ? '20' : String(v[3]),
      cur: 'pointer',
      tf: on ? `translate(${zx}%,${zy}%) scale(${sc.toFixed(2)})` : 'none',
      f: hf === undefined || on ? 'none' : 'saturate(.85) brightness(.82)',
      click: on ? () => heroFeat(undefined) : () => heroFeat(n),
      isOn: on,
      stop: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      leave: on ? releaseHero : undefined,
      enter: on ? holdHero : undefined,
      kitAcc: accName ? k.label + ' · ' + accName : k.label,
      kit: k.label,
      name,
      device: kind === 'isLivePad' ? 'iPad' : DEV[s],
      dot: k.accent,
    }
  })
  const hero = {
    ...base,
    devs,
    surfaces: devs.map((d: Any, n: number) => ({ kit: d.kit, name: d.name, device: d.device, dot: d.dot, onClick: d.click, chipBg: hf === n ? 'rgba(246,240,255,.14)' : 'transparent' })),
  }
  let lbv: Any = { open: false }
  if (lb) {
    const th = all.find((x) => x.id === lb.id) as Any
    const s = SURF.find((x) => x[0] === lb.surf) as string[]
    const sizes: Any = { website: ['min(1280px,100%)', '82vh'], space: ['min(1280px,100%)', '82vh'], spotlight: ['390px', 'min(844px,82vh)'], email: ['368px', '82vh'] }
    lbv = {
      open: true,
      th,
      isSpace: lb.surf === 'space',
      isImg: th.shots && lb.surf !== 'space',
      src: th.img[lb.surf],
      fw: sizes[lb.surf][0],
      fh: sizes[lb.surf][1],
      title: `${th.label} · ${s[1]} · ${th.accentLabel}`,
      close: () => setLb(null),
      stop: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      tabs: SURF.map((x) => ({
        label: x[1],
        pressed: x[0] === lb.surf ? 'true' : 'false',
        bg: x[0] === lb.surf ? '#F6F0FF' : 'transparent',
        color: x[0] === lb.surf ? '#140B22' : '#D9CFEA',
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          setLb({ id: lb.id, surf: x[0] })
        },
      })),
    }
  }
  const readyAll = all.reduce((n, t) => n + SURF.filter((s) => t.facts.ready[s[0] as keyof typeof t.facts.ready]).length, 0)
  const mineKit = mine ? all.find((t) => props.links.kits[t.id]?.theme === mine.theme) : undefined
  return {
    hero,
    scenes,
    lb: lbv,
    kitTotal: String(N),
    kitWord: WORDS[N] ?? String(N),
    accentTotal: THEMES.reduce((n, t) => n + t.accents.length, 0),
    readyTotal: String(readyAll),
    readyLabel: `Of ${N * 4} surfaces ready today`,
    countLabel: `${scenes.length} of ${N}`,
    links: props.links,
    filters: FILTERS.map(([id, label]) => ({ label, pressed: filter === id ? 'true' : 'false', bg: filter === id ? '#F6F0FF' : 'transparent', color: filter === id ? '#140B22' : '#D9CFEA', onClick: () => setFilter(id) })),
    // Register and Ready (LIVE-1866): a pressed chip pressed again clears its group.
    registerFilters: REGISTER_FILTERS.map(([id, label]) => ({ label, pressed: register === id ? 'true' : 'false', bg: register === id ? '#F6F0FF' : 'transparent', color: register === id ? '#140B22' : '#D9CFEA', onClick: () => setRegister((r) => (r === id ? 'all' : id)) })),
    readyFilters: READY_FILTERS.map(([id, label]) => ({ label, pressed: ready === id ? 'true' : 'false', bg: ready === id ? '#F6F0FF' : 'transparent', color: ready === id ? '#140B22' : '#D9CFEA', onClick: () => setReady((r) => (r === id ? 'all' : id)) })),
    yourTheme: mineKit ? { label: mineKit.label, accent: mineKit.accent, href: themePagePath(mine!.theme) } : null,
  }
}
