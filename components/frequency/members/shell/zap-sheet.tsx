'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { useMindless } from '@/components/on-air/mindless'
import styles from './zap-sheet.module.css'

/** The quick-action surface; destinations retain their own permission and session checks. */
export function ZapSheet({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const mindless = useMindless()
  useEffect(() => {
    const panel = root.current
    if (!panel) return
    const previous = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>('button,a[href]'))
    controls()[0]?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const list = controls()
      const first = list[0], last = list[list.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      html.style.overflow = overflow
      document.removeEventListener('keydown', trap)
      // A handoff to Capture or Mindless owns its new focus; never pull it back.
      if (panel.contains(document.activeElement) || document.activeElement === document.body) previous?.focus()
    }
  }, [])
  const capture = (mode: 'post' | 'contact') => {
    onClose()
    window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode } }))
  }
  const content = (icon: FqIconName, title: string, sub: string) => <><span className={styles.icon}><FqIcon name={icon} /></span><strong>{title}</strong><small>{sub}</small></>
  return <div ref={root} className={styles.root}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>A little spark</span><h2>Make a moment.</h2></div>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close Zap menu"><FqIcon name="close" /></button>
    </div>
    <div className={styles.grid}>
      <button type="button" onClick={() => capture('post')}>{content('page', 'Share', 'A thought, photo or note')}</button>
      <Link href="/events/new" onClick={onClose}>{content('event', 'Create event', 'Bring people together')}</Link>
      <button type="button" onClick={() => capture('contact')}>{content('contacts', 'Save contact', 'Remember who you met')}</button>
      <Link href="/codes" onClick={onClose}>{content('qr', 'Connect', 'Share your personal code')}</Link>
    </div>
    <button type="button" className={styles.mindless} onClick={() => { onClose(); mindless.open() }}>
      <span className={`orb fq-breathe ${styles.orb}`} aria-hidden />
      <span><strong>Mindless</strong><small>Tune out. Get moving.</small></span>
      <span className={styles.start}>Start <FqIcon name="arrow" /></span>
    </button>
    <nav className={styles.tools} aria-label="More Zap tools">
      <Link href="/events/scan" onClick={onClose}><FqIcon name="camera" /> Scan a poster</Link>
      <Link href="/connections/new" onClick={onClose}><FqIcon name="contacts" /> Scan a card</Link>
      <Link href="/journal" onClick={onClose}><FqIcon name="page" /> Your log</Link>
    </nav>
  </div>
}
