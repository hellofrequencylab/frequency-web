// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, container: HTMLDivElement
import { FeedPlanner } from './planner'
import type { RankedHomeEvent } from '@/lib/feed/home-rank'
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus: vi.fn() }))
afterEach(() => { act(() => root?.unmount()); container?.remove() })
it.each(['Recommended', null])('names the photo link with its visible badge (%s) and event', badge => {
  const event: RankedHomeEvent = { id: 'fixture', slug: 'fixture-event', title: 'Evening walk', location: 'Park', startsAt: '2026-10-28T18:00:00Z', endsAt: null, category: null, energyTag: null, coverUrl: '/fixture.jpg', hostId: null, hostSpaceId: null, hostName: null, myCircleName: null, distanceMi: 1, goingCount: 0, friends: [], myStatus: null, slot: 'tonight', intent: 'social', badge, live: false, score: 1, why: 'Nearby', when: 'Tonight', dayOffset: 0 }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  act(() => root.render(<FeedPlanner events={[event]} plans={[]} doorZaps={0} hasHome />))
  const photo = container.querySelector('.fa-hero-ph')!
  expect(photo.getAttribute('aria-label')).toBe(badge ? `Evening walk · ${badge}` : 'Evening walk')
  expect(photo.textContent).toBe(badge ?? '')
  expect(photo.getAttribute('href')).toBe('/events/fixture-event')
})
