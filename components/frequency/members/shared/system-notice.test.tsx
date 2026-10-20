// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SystemNotice } from './system-notice'

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }))

let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => { act(() => root?.unmount()); host?.remove() })

describe('SystemNotice', () => {
  it('says what is empty and points at the next step', () => {
    host = document.createElement('div'); document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<SystemNotice icon="circle" title="Nothing yet." body="Join one." actions={[{ href: '/circles', label: 'Find a Circle', primary: true }, { href: '/events/new', label: 'Add an event' }]} />))
    expect(host.querySelector('[role="status"] b')?.textContent).toBe('Nothing yet.')
    const links = [...host.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/circles', '/events/new'])
    expect(links[0].className).toContain('pa')
    expect(links[1].className).not.toContain('pa')
  })
})
