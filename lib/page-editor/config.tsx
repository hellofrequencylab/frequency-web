import type { Config } from '@measured/puck'
import {
  PageHero,
  ZigZag,
  Statement,
  Marquee,
  BetaCTA,
} from '@/components/marketing/marketing-ui'
import { ImageField } from './image-field'

// Shared by BOTH the editor (<Puck>) and the public renderer (<Render>). The
// palette is our existing marketing blocks, styled with DAWN tokens — so the
// editor can't go off-brand. See docs/PAGE-EDITOR-SPEC.md.

// Wrap an accent word in the brand colour.
function accentize(text?: string, accent?: string): React.ReactNode {
  if (!text) return null
  if (!accent || !text.includes(accent)) return text
  const i = text.indexOf(accent)
  return (
    <>
      {text.slice(0, i)}
      <span className="text-primary">{accent}</span>
      {text.slice(i + accent.length)}
    </>
  )
}

// Body text → paragraphs (split on blank lines).
function paragraphs(body?: string): React.ReactNode {
  if (!body) return null
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => <p key={i}>{p}</p>)
}

const toneField = {
  type: 'select' as const,
  options: [
    { label: 'White', value: 'surface' },
    { label: 'Cream', value: 'canvas' },
  ],
}

const imgField = {
  type: 'custom' as const,
  render: ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => (
    <ImageField value={value} onChange={onChange} />
  ),
}

export const config: Config = {
  components: {
    PageHero: {
      label: 'Page hero',
      fields: {
        eyebrow: { type: 'text' },
        title: { type: 'text' },
        titleAccent: { type: 'text', label: 'Title accent word (optional)' },
        subtitle: { type: 'textarea' },
      },
      defaultProps: { eyebrow: 'Eyebrow', title: 'Headline', titleAccent: '', subtitle: '' },
      render: ({ eyebrow, title, titleAccent, subtitle }) => (
        <PageHero eyebrow={eyebrow || undefined} title={accentize(title, titleAccent)} subtitle={subtitle || undefined} />
      ),
    },

    ZigZag: {
      label: 'Image + text',
      fields: {
        image: imgField,
        alt: { type: 'text' },
        eyebrow: { type: 'text' },
        title: { type: 'text' },
        titleAccent: { type: 'text', label: 'Title accent word (optional)' },
        kicker: { type: 'text', label: 'Italic kicker (optional)' },
        body: { type: 'textarea' },
        side: {
          type: 'radio',
          options: [
            { label: 'Image left', value: 'left' },
            { label: 'Image right', value: 'right' },
          ],
        },
        tone: toneField,
        imgAspect: {
          type: 'select',
          options: [
            { label: 'Landscape', value: 'landscape' },
            { label: 'Portrait', value: 'portrait' },
            { label: 'Square', value: 'square' },
            { label: 'Natural (uncropped)', value: 'natural' },
          ],
        },
        ctaLabel: { type: 'text', label: 'CTA label (optional)' },
        ctaHref: { type: 'text', label: 'CTA link (optional)' },
      },
      defaultProps: {
        image: '',
        alt: '',
        eyebrow: 'Eyebrow',
        title: 'Headline',
        titleAccent: '',
        kicker: '',
        body: 'Body copy.',
        side: 'left',
        tone: 'surface',
        imgAspect: 'landscape',
        ctaLabel: '',
        ctaHref: '',
      },
      render: ({ image, alt, eyebrow, title, titleAccent, kicker, body, side, tone, imgAspect, ctaLabel, ctaHref }) => (
        <ZigZag
          img={image || '/images/site/community-1.jpg'}
          alt={alt || ''}
          eyebrow={eyebrow || undefined}
          title={accentize(title, titleAccent)}
          kicker={kicker || undefined}
          reverse={side === 'right'}
          tone={tone as 'surface' | 'canvas'}
          imgAspect={imgAspect as 'landscape' | 'portrait' | 'square' | 'natural'}
          cta={ctaLabel && ctaHref ? { label: ctaLabel, href: ctaHref } : undefined}
        >
          {paragraphs(body)}
        </ZigZag>
      ),
    },

    Statement: {
      label: 'Big statement',
      fields: {
        text: { type: 'textarea' },
        accent: { type: 'text', label: 'Accent word (optional)' },
        tone: toneField,
      },
      defaultProps: { text: 'A bold statement.', accent: '', tone: 'canvas' },
      render: ({ text, accent, tone }) => (
        <Statement tone={tone as 'surface' | 'canvas'}>{accentize(text, accent)}</Statement>
      ),
    },

    BetaCTA: {
      label: 'Beta call-to-action',
      fields: {
        heading: { type: 'text' },
        headingAccent: { type: 'text', label: 'Heading accent word (optional)' },
        body: { type: 'textarea' },
      },
      defaultProps: { heading: 'Be one of the first.', headingAccent: '', body: '' },
      render: ({ heading, headingAccent, body }) => (
        <BetaCTA heading={accentize(heading, headingAccent)} body={body || undefined} />
      ),
    },

    Marquee: {
      label: 'Scrolling marquee',
      fields: {
        items: { type: 'array', arrayFields: { text: { type: 'text' } }, getItemSummary: (i: { text?: string }) => i.text || 'Item' },
      },
      defaultProps: { items: [{ text: 'What we’re building' }] },
      render: ({ items }) => (
        <section className="bg-text">
          <Marquee items={(items || []).map((i: { text?: string }) => i.text || '')} />
        </section>
      ),
    },

    ImageBand: {
      label: 'Full-width image',
      fields: {
        image: imgField,
        alt: { type: 'text' },
        aspect: {
          type: 'select',
          options: [
            { label: 'Cinematic (21:9)', value: '21/9' },
            { label: 'Wide (16:9)', value: '16/9' },
            { label: 'Landscape (4:3)', value: '4/3' },
          ],
        },
      },
      defaultProps: { image: '', alt: '', aspect: '21/9' },
      render: ({ image, alt, aspect }) => (
        <div className="px-6 py-4">
          <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden border border-border shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image || '/images/site/lab-storefront.jpg'} alt={alt || ''} className="w-full object-cover" style={{ aspectRatio: aspect }} />
          </div>
        </div>
      ),
    },

    Spacer: {
      label: 'Spacer',
      fields: {
        size: {
          type: 'select',
          options: [
            { label: 'Small', value: '2rem' },
            { label: 'Medium', value: '4rem' },
            { label: 'Large', value: '7rem' },
          ],
        },
      },
      defaultProps: { size: '4rem' },
      render: ({ size }) => <div style={{ height: size }} />,
    },
  },
}
