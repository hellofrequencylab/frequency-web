import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { focusFacts, phaseHeading, splitTitle } from '@/lib/journeys/lesson-markdown'

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/app/themes/active/members-c', () => ({}))

const html = async (md: string) => {
  const { LessonProse } = await import('./lesson-prose')
  return renderToStaticMarkup(<LessonProse>{md}</LessonProse>)
}
const words = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('LessonProse', () => {
  it('draws a Markdown list as a list, never as lines that start with a dash', async () => {
    const out = await html('Every week has the same three parts:\n\n- Before Thursday: read.\n- Thursday: meet.\n\nThen more.')
    expect(out).toContain('<ul')
    expect(out).not.toMatch(/>\s*- /)
    expect(out).toContain('<p class="mc-lede mc-leadin">')
    expect(out).toContain('<ul class="mc-terms">')
    expect(out).toContain('<strong>Before Thursday:</strong> read.')
  })

  it('turns a short lead-in and its list into a titled group, without the colon', async () => {
    const out = await html('Opening words.\n\nBring to Thursday:\n\n- Your open loops.\n- The names of who came.')
    expect(out).toContain('<section class="mc-group"><p class="mc-group-k">Bring to Thursday</p>')
  })

  it('names a timed run of show and a page of prompts', async () => {
    const beats = await html('- Presence, 3 minutes. Phone face down.\n- Lead, 15 minutes. Your list.')
    expect(beats).toContain('<ul class="mc-beats">')
    expect(beats).toContain('<strong>Presence</strong><span class="mc-time">3 minutes</span><span class="mc-beat-body">Phone face down.</span>')

    const fill = await html('- My purpose, in one line:\n- Parking list:')
    expect(fill).toContain('<ul class="mc-fill">')
    expect(fill).toContain('<li>Parking list</li>')
  })

  it('leaves an ordinary list, a mixed list and an ordered list alone', async () => {
    expect(await html('- Speak for yourself.\n- Listen without advising.')).toContain('<ul>')
    expect(await html('- Presence: the idea.\n- A plain line.')).toContain('<ul>')
    expect(await html('1. First: do this.\n2. Second: do that.')).toContain('<ol>')
  })

  it('sets a short opener over a long paragraph as its run-in heading', async () => {
    const long = 'Overwhelm usually shows up in the body before it shows up in the plan: the chest, the jaw, the shoulders. Breathe out longer than you breathe in.'
    const out = await html(`Welcome.\n\nStaying steady. ${long}\n\nNot now. Short.`)
    expect(out).toContain(`<p><strong class="mc-runin">Staying steady</strong>${long}</p>`)
    expect(out).toContain('<p>Not now. Short.</p>')
  })

  it('keeps a long first paragraph as body text', async () => {
    expect(await html(`${'A long opening sentence that keeps going. '.repeat(6)}\n\nNext.`)).not.toContain('mc-lede')
  })

  it('never drops a word', async () => {
    const out = await html('Welcome.\n\nBring to Thursday:\n\n- Presence, 3 minutes. Breathe.\n- Lead, 15 minutes. The **list**.')
    expect(words(out)).toBe('Welcome. Bring to Thursday Presence 3 minutes Breathe. Lead 15 minutes The list .')
  })

  it('starts an author heading at h2 and opens an outside link in a new tab', async () => {
    const out = await html('# Big idea\n\nSee [the guide](/help) and [a site](https://example.com).')
    expect(out).toContain('<h2>Big idea</h2>')
    expect(out).toContain('<a href="/help">the guide</a>')
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">a site</a>')
  })
})

describe('titles and week facts', () => {
  it('splits "Kind · Name" and leaves a plain title whole', () => {
    expect(splitTitle('Overview · Slow is smooth')).toEqual({ kind: 'Overview', name: 'Slow is smooth' })
    expect(splitTitle('Morning light')).toEqual({ kind: null, name: 'Morning light' })
  })

  it('reads a week focus as facts', () => {
    expect(focusFacts("This week's meeting: the weekly sit-down.\n\nThe one idea: Small and steady.\n\nJust a line.")).toEqual([
      { label: "This week's meeting", value: 'The weekly sit-down.' },
      { label: 'The one idea', value: 'Small and steady.' },
      { label: null, value: 'Just a line.' },
    ])
  })

  it('never doubles a week label', () => {
    expect(phaseHeading('Week 1 · The Engine', 0, 'week')).toBe('Week 1 · The Engine')
    expect(phaseHeading('Attention', 1, 'week')).toBe('Week 2 · Attention')
    expect(phaseHeading('Month 3', 2, 'month')).toBe('Month 3')
  })
})
