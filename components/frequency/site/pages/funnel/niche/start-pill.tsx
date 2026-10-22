'use client'

// The phone-width "Open your Space" pill (design: .nk-pill). Pinned to the bottom of the screen once the
// reader has scrolled past the hero, and out of the way again at the two doors (which carry the same
// button). CSS shows it only under 760px.
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function NicheStartPill({
  href,
  label,
  heroId,
  doorsId,
}: {
  href: string
  label: string
  heroId: string
  doorsId: string
}) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const hero = document.getElementById(heroId)
    const doors = document.getElementById(doorsId)
    if (!hero || !doors) return
    let inHero = true
    let inDoors = false
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) inHero = e.isIntersecting
        else inDoors = e.isIntersecting
      }
      setOn(!inHero && !inDoors)
    })
    io.observe(hero)
    io.observe(doors)
    return () => io.disconnect()
  }, [heroId, doorsId])
  return (
    <Link
      className={`nk-pill fq-iri-btn${on ? ' on' : ''}`}
      href={href}
      tabIndex={on ? 0 : -1}
      aria-hidden={on ? undefined : true}
    >
      {label}
    </Link>
  )
}
