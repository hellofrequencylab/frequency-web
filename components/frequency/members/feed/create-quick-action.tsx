'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Dialog } from '@/components/ui/dialog'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import styles from './create-quick-action.module.css'

export const COMPOSE_EVENT = 'fq:compose'
const CREATE: { label: string; sub: string; href: string; icon: FqIconName }[] = [
  { label: 'Post', sub: 'Share with your community', href: '#compose', icon: 'page' },
  { label: 'Event', sub: 'Bring people together', href: '/events/new', icon: 'event' },
  { label: 'Circle', sub: 'Start from a template', href: '/circles/new', icon: 'circle' },
  { label: 'Practice', sub: 'Write one or fork one', href: '/practices/new', icon: 'checkin' },
  { label: 'Journey', sub: 'Build a guided sequence', href: '/journeys/new', icon: 'program' },
  { label: 'Listing', sub: 'Offer something locally', href: '/classifieds/new', icon: 'ticket' },
]

/** Bound the desktop anchored panel to its own viewport, never the content column's width. */
export function createMenuPosition(rect: Pick<DOMRect, 'right' | 'bottom'>, width: number, height: number) {
  const panelWidth = Math.min(360, Math.max(0, width - 24))
  const left = Math.max(12, Math.min(rect.right - panelWidth, width - panelWidth - 12))
  const top = Math.max(12, Math.min(rect.bottom + 8, height - 180))
  return { left, top, maxHeight: Math.max(120, height - top - 12) }
}

export function CreateMenuContent({ onClose, onPost, headingId }: { onClose: () => void; onPost: () => void; headingId: string }) {
  return <div className={styles.content}>
    <div className={styles.heading}><div><h2 id={headingId}>Create</h2><p>Share, gather, or offer something.</p></div><IconButton label="Close Create" onClick={onClose}><FqIcon name="close" /></IconButton></div>
    <nav aria-label="Create something" className={styles.actions}>{CREATE.map((item) => <Link key={item.label} href={item.href} onClick={(event) => {
      onClose()
      if (item.href === '#compose') { event.preventDefault(); onPost() }
    }}><FqIcon name={item.icon} /><span><b>{item.label}</b><small>{item.sub}</small></span><FqIcon name="chevron" /></Link>)}</nav>
  </div>
}

export function CreateButton() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const id = useId()
  const position = useCallback(() => {
    const panel = surface.current?.closest<HTMLElement>('[role="dialog"]')
    if (!panel || !trigger.current) return
    const p = createMenuPosition(trigger.current.getBoundingClientRect(), window.innerWidth, window.innerHeight)
    panel.style.setProperty('--create-left', `${p.left}px`)
    panel.style.setProperty('--create-top', `${p.top}px`)
    panel.style.setProperty('--create-max-height', `${p.maxHeight}px`)
  }, [])
  const mountSurface = useCallback((node: HTMLDivElement | null) => { surface.current = node; if (node) position() }, [position])
  useEffect(() => { if (!open) return; window.addEventListener('resize', position); return () => window.removeEventListener('resize', position) }, [open, position])
  return <>
    <Button ref={trigger} size="sm" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}><FqIcon name="plus" />Create</Button>
    <Dialog open={open} onClose={() => setOpen(false)} ariaLabelledBy={`${id}-heading`} align="bottom" className={styles.dialog}>
      <div ref={mountSurface} id={id}><CreateMenuContent headingId={`${id}-heading`} onClose={() => setOpen(false)} onPost={() => window.dispatchEvent(new Event(COMPOSE_EVENT))} /></div>
    </Dialog>
  </>
}
