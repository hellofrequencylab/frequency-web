// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  setSpaceTimeZone: async () => ({ data: undefined }),
  setSpaceSkyMarkers: async () => ({ data: undefined }),
  saveDayNote: async () => ({ data: undefined }),
  removeDayNote: async () => ({ data: undefined }),
}))

import { SuiteSettings } from './suite-settings'

// THE SETTINGS SHEET, DRIVEN. It holds the four sections the handoff names, the two copy buttons put the
// right link on the clipboard with the handoff's toast, and someone who can only read the calendar gets
// no team feed.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const written: string[] = []

function mount(over: Partial<React.ComponentProps<typeof SuiteSettings>> = {}) {
  const say = vi.fn()
  const onClose = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root.render(
      <SuiteSettings
        slug="ocean-house"
        canEdit
        timeZone="America/Los_Angeles"
        skyOn
        notes={[{ id: 'n1', label: 'Quiet hours after 10 PM', weekdays: [1], startsOn: null, endsOn: null }]}
        publicFeedUrl="https://example.test/spaces/ocean-house/calendar.ics"
        teamFeedUrl={async () => 'https://example.test/calendar/private/abc'}
        sharedPlans={2}
        say={say}
        onClose={onClose}
        {...over}
      />,
    ),
  )
  return { say, onClose }
}
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  written.length = 0
})
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true })

const byText = (sel: string, text: string) => [...host.querySelectorAll(sel)].find((e) => e.textContent?.includes(text)) as HTMLElement | undefined
const press = async (el: HTMLElement | undefined) => {
  await act(async () => void el!.click())
}

describe('Calendar settings', () => {
  it('names the four sections and the shared Plans line', () => {
    mount()
    const text = host.textContent ?? ''
    for (const w of ['Calendar settings', 'Time', 'Sky markers', 'Day notes', 'Sync and feeds', 'Quiet hours after 10 PM', 'Google Calendar', '2 shared Plans']) {
      expect(text, w).toContain(w)
    }
  })

  it('copies the public feed and says so', async () => {
    const { say } = mount()
    await press(byText('button', 'Copy public feed'))
    expect(written).toEqual(['https://example.test/spaces/ocean-house/calendar.ics'])
    expect(say).toHaveBeenCalledWith('Public feed link copied', 'success')
  })

  it('copies the team feed and asks the team to keep it', async () => {
    const { say } = mount()
    await press(byText('button', 'Copy team feed'))
    expect(written).toEqual(['https://example.test/calendar/private/abc'])
    expect(say).toHaveBeenCalledWith('Private team feed copied. Keep it to your team.', 'success')
  })

  it('says plainly when the team feed could not be made', async () => {
    const { say } = mount({ teamFeedUrl: async () => null })
    await press(byText('button', 'Copy team feed'))
    expect(written).toEqual([])
    expect(say).toHaveBeenCalledWith('The team feed could not be made. Try again in a moment.', 'danger')
  })

  it('a reader gets the public feed and no team feed', () => {
    mount({ canEdit: false })
    expect(byText('button', 'Copy public feed')).toBeTruthy()
    expect(byText('button', 'Copy team feed')).toBeUndefined()
  })

  it('Close closes the sheet', async () => {
    const { onClose } = mount()
    await press(host.querySelector('button[aria-label="Close"]') as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })
})
