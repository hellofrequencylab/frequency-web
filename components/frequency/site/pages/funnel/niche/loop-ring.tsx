'use client'

// The "how people come back" ring (design: .ring with Meet, Save, Invite, Return). One node lights at a
// time, a new one every 2.4 seconds, round the loop. Under prefers-reduced-motion the first node stays lit.
import { useEffect, useState } from 'react'

const NODES: readonly { label: string; left: string; top: string }[] = [
  { label: 'Meet', left: '50%', top: '0' },
  { label: 'Save', left: '100%', top: '50%' },
  { label: 'Invite', left: '50%', top: '100%' },
  { label: 'Plan again', left: '0', top: '50%' },
]

export function NicheLoopRing() {
  const [on, setOn] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setOn((i) => (i + 1) % NODES.length), 2400)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="ring" aria-hidden="true" data-px=".2">
      {NODES.map((n, i) => (
        <span key={n.label} className={i === on ? 'node on' : 'node'} style={{ left: n.left, top: n.top }}>
          {n.label}
        </span>
      ))}
      <div className="core">
        <b>Keep in touch</b>
        <small>Share another date when you have one.</small>
      </div>
    </div>
  )
}
