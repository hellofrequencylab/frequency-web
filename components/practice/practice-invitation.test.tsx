// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PRACTICE_SUPPORT_CHOICES } from '@/lib/practices/invitations'

vi.mock('next/link', () => ({ default: ({ href, children, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
  void prefetch
  return <a href={href} {...props}>{children}</a>
} }))
import { PracticeInvitation } from './practice-invitation'

let root: Root
let el: HTMLDivElement

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  el = document.createElement('div')
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root.render(<PracticeInvitation />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  el.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function click(label: string) {
  const button = [...el.querySelectorAll('button')].find((node) => node.textContent?.includes(label))
  if (!button) throw new Error(`Button not found: ${label}`)
  await act(async () => button.click())
}

describe('the voluntary practice invitation', () => {
  it('starts with an accessible invitation and no inferred recommendation', () => {
    const section = el.querySelector('section')!
    const heading = el.querySelector('h2')!
    expect(heading.textContent).toBe('What would support you today?')
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(el.querySelectorAll('[aria-pressed="false"]')).toHaveLength(6)
    expect(el.querySelector('[role="status"]')).toBeNull()
    expect(el.querySelector('a')).toBeNull()
  })

  it.each(PRACTICE_SUPPORT_CHOICES)('lets the person choose $area and then explore its actual library', async (choice) => {
    await click(choice.label)
    expect(el.querySelector('[aria-pressed="true"]')?.textContent).toContain(choice.label)
    expect(el.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    const link = el.querySelector('a')!
    expect(link.getAttribute('href')).toBe(`/discover/practices/pillar/${choice.id}`)
    expect(link.textContent).toBe(`Explore ${choice.area} practices`)
    expect(el.querySelector('[role="status"]')?.textContent).not.toMatch(/low|deficient|must|should|heal/i)
  })

  it('allows expression privately without a prerequisite', async () => {
    await click('Make or share something')
    expect(el.querySelector('[role="status"]')?.textContent).toContain('keep it private')
    expect(el.querySelector('[role="status"]')?.textContent).toContain('begin as you are')
  })

  it('acknowledges rest without logging, network activity, or persisting a personal choice', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    await click('Rest today')
    expect(el.querySelector('[role="status"]')?.textContent).toContain('nothing to log here')
    expect(el.querySelector('a')).toBeNull()
    expect(request).not.toHaveBeenCalled()
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('lets a person stay with a familiar practice without assuming they have adopted one', async () => {
    await click('Stay with something familiar')
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/practices')
    expect(el.querySelector('a')?.textContent).toBe('Browse practices')
  })

  it('lets a person change direction or clear the suggestion', async () => {
    await click('Clear my head')
    await click('Care for my body')
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/discover/practices/pillar/body')
    await click('Something else')
    expect(el.querySelector('[role="status"]')).toBeNull()
    expect(el.querySelector('[aria-pressed="true"]')).toBeNull()
  })

  it('dismisses without saving the choice and starts fresh on a new mount', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    await click('Not now')
    expect(el.innerHTML).toBe('')
    await act(async () => root.unmount())
    root = createRoot(el)
    await act(async () => root.render(<PracticeInvitation />))
    expect(el.querySelector('h2')?.textContent).toBe('What would support you today?')
    expect(el.querySelector('[role="status"]')).toBeNull()
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('is integrated after the feed board and on the practice entry page without depending on unlocks', () => {
    const feed = readFileSync('app/(main)/feed/page.tsx', 'utf8')
    expect(feed.indexOf('<PracticeInvitation')).toBeGreaterThan(feed.indexOf('<PracticePrompt'))
    expect(feed.indexOf('<PracticeInvitation')).toBeLessThan(feed.indexOf('<CaptureBar'))
    const practices = readFileSync('app/(main)/practices/page.tsx', 'utf8')
    expect(practices.indexOf('<PracticeInvitation')).toBeLessThan(practices.indexOf('<PageModules route='))
    expect(feed).not.toMatch(/stageUnlocked\([^)]*PracticeInvitation/)
  })
})
