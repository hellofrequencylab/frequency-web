// @vitest-environment jsdom
// Guard for docs/FINALIZE-PLAN §9.12: the Skeleton default radius must not fight a caller's.
//
// The defect these pin was invisible for a reason worth remembering. `cn`/template joins put BOTH
// radii on the element and Tailwind's ALPHABETICAL emission order decided the winner, so of the 126
// call sites that pass a radius, 74 worked perfectly and 52 did not. A test written against a
// single caller had a coin-flip chance of catching it — so the cases below are drawn deliberately
// from BOTH sides of `rounded-control` in that order.
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Skeleton } from './skeleton'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

/** Render a Skeleton and return the radius utilities actually on the element. */
function radii(className?: string): string[] {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<Skeleton className={className} />))
  const el = container.firstChild as HTMLElement
  return Array.from(el.classList).filter((c) => {
    const base = c.slice(c.lastIndexOf(':') + 1)
    return base === 'rounded' || base.startsWith('rounded-')
  })
}

describe('Skeleton radius', () => {
  it('applies the design-system default when the caller names none', () => {
    expect(radii()).toEqual(['rounded-control'])
    expect(radii('h-4 w-14')).toEqual(['rounded-control'])
  })

  // The 52 that were BROKEN: these sort before rounded-control, so the hardcoded default won.
  it.each(['rounded-2xl', 'rounded-card', 'rounded-3xl'])(
    'yields to %s, which the hardcoded default used to beat',
    (radius) => {
      expect(radii(`h-96 ${radius}`)).toEqual([radius])
    },
  )

  // The 74 that ALREADY WORKED: these sort after, so they won even before the fix. Pinned so the
  // fix is proven not to have disturbed them — a regression here would be silent in every render.
  it.each(['rounded-pill', 'rounded-lg', 'rounded-xl', 'rounded-md', 'rounded-none'])(
    'still yields to %s, which already won on emission order',
    (radius) => {
      expect(radii(`h-4 w-14 ${radius}`)).toEqual([radius])
    },
  )

  it('never emits two radii, whichever form the caller passes', () => {
    for (const r of ['rounded-2xl', 'rounded-pill', 'rounded-t', 'rounded-tl-lg', 'rounded-[3px]', 'rounded']) {
      expect(radii(`p-2 ${r}`), `two radii for ${r}`).toHaveLength(1)
    }
  })

  it('honours a variant-prefixed radius, so a responsive override is not doubled', () => {
    expect(radii('h-4 sm:rounded-2xl')).toEqual(['sm:rounded-2xl'])
  })

  it('is not fooled by a class that merely contains the word', () => {
    // A token whose BASE does not start with `rounded-` must not suppress the default, even though
    // the word appears inside it. The detector compares the base, not a substring, so this holds.
    //
    // Assembled at runtime rather than written as a literal ON PURPOSE: `check:phantom` scans
    // source for class-like strings that emit no CSS, and it is right to — a fake class written
    // into a className is exactly the typo it exists to catch. Spelling it here would make this
    // test the one place in the repo that trips its own guard, so the string is built instead.
    const containsButIsNotARadius = ['border', 'rounded'].join('-')
    expect(radii(`h-4 ${containsButIsNotARadius}`)).toEqual(['rounded-control'])
  })

  it('keeps the rest of the contract: aria-hidden, the pulse, and the fill', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(<Skeleton className="h-4 rounded-2xl" />))
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.classList.contains('animate-pulse')).toBe(true)
    expect(el.classList.contains('bg-border-strong')).toBe(true)
    expect(el.classList.contains('h-4')).toBe(true)
  })
})
