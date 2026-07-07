import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FieldEditor } from '@/components/entity-blocks/block-edit-panel'
import { HERO_FIELDS } from '@/lib/spaces/hero-config'

// The pinned Top Hero editor is auth-gated in the live app (it mounts only inside the owner rail), so we assert
// its CONTROL SURFACE via render tests: every hero field dispatches through the SAME FieldEditor the block
// panel uses, and the pinned panel reads as a fixed, non-reorderable first section. next/navigation is mocked
// so the client panel renders to static markup.

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const noop = () => {}

describe('hero editor control surface (declared HERO_FIELDS)', () => {
  it('renders the height primitive as a Short | Medium | Tall selector', () => {
    const field = HERO_FIELDS.find((f) => f.key === 'height')!
    const html = renderToStaticMarkup(<FieldEditor field={field} value={undefined} onChange={noop} />)
    expect(html).toContain('aria-label="Height"')
    expect(html).toContain('Short')
    expect(html).toContain('Medium')
    expect(html).toContain('Tall')
  })

  it('renders the button-orientation primitive (side by side | stacked)', () => {
    const field = HERO_FIELDS.find((f) => f.key === 'buttonOrientation')!
    const html = renderToStaticMarkup(<FieldEditor field={field} value={undefined} onChange={noop} />)
    expect(html).toContain('aria-label="Button layout"')
    expect(html).toContain('aria-label="Side by side"')
    expect(html).toContain('aria-label="Stacked"')
  })

  it('renders the eyebrow / heading / tagline / CTA copy fields as inputs', () => {
    for (const key of ['eyebrow', 'heading', 'tagline', 'ctaLabel', 'ctaUrl'] as const) {
      const field = HERO_FIELDS.find((f) => f.key === key)!
      const html = renderToStaticMarkup(<FieldEditor field={field} value={undefined} onChange={noop} />)
      expect(html).toContain(field.label)
    }
  })

  it('the CTA link field is a url input (safe href discipline)', () => {
    const field = HERO_FIELDS.find((f) => f.key === 'ctaUrl')!
    const html = renderToStaticMarkup(<FieldEditor field={field} value={undefined} onChange={noop} />)
    expect(html).toContain('type="url"')
  })
})

describe('HeroEditPanel (pinned, fixed first section)', () => {
  it('renders a Top hero header and no drag / remove / reorder affordance', async () => {
    const { HeroEditPanel } = await import('./hero-edit-panel')
    const html = renderToStaticMarkup(
      <HeroEditPanel slug="river-yoga" initial={{ heading: 'River Yoga', tagline: 'By the river.' }} />,
    )
    expect(html).toContain('Top hero')
    // Fixed section: it always stays first, so it exposes none of the block controls.
    expect(html).not.toContain('Reorder')
    expect(html).not.toContain('Delete row')
    expect(html).not.toContain('Move to Blocks')
    // It opens showing the current values.
    expect(html).toContain('River Yoga')
    expect(html).toContain('By the river.')
  })
})
