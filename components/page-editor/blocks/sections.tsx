// Standardised "Sections" block library for the Puck page editor.
// Three blocks: Hero (image / split / minimal variants), CallToAction, Quote (pull / testimonial).
// Every block follows the frozen contract in kit.tsx exactly:
//   fields → defaultProps → render threading blockFields() through <Band> where applicable.
// Full-bleed blocks (Hero image, CTA ink) own their own <section> per the kit spec.

import Image from 'next/image'
import type { ComponentConfig } from '@measured/puck'

import {
  Band,
  Eyebrow,
  DisplayHeading,
  Kicker,
  CtaButton,
  blockFields,
  blockLayoutDefaults,
  accentize,
  padClass,
  visClass,
  type LayoutValue,
} from './kit'
import { toneBg, isInk } from '@/lib/page-editor/fields'
import { focalField, focalClass } from '@/lib/page-editor/image-controls'
import { imgField } from '@/lib/page-editor/fields'
import { SiteImage } from '@/components/marketing/site-image'
import { PhotoHero } from '@/components/marketing/marketing-ui'

// ─────────────────────────────────────────────────────────────────────────────
// Hero — three layout variants
// ─────────────────────────────────────────────────────────────────────────────

type HeroVariant = 'image' | 'split' | 'minimal'

export function HeroSection({
  variant,
  eyebrow,
  title,
  subtitle,
  image,
  focal,
  minHeight,
  ctaPrimaryLabel,
  ctaPrimaryHref,
  ctaSecondaryLabel,
  ctaSecondaryHref,
  note,
  tone,
  align,
  width,
  layout,
}: {
  variant: HeroVariant
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  image?: string
  focal?: string
  minHeight?: 'auto' | 'screen'
  ctaPrimaryLabel?: string
  ctaPrimaryHref?: string
  ctaSecondaryLabel?: string
  ctaSecondaryHref?: string
  note?: string
  tone?: string
  align?: string
  width?: string
  layout?: LayoutValue
}) {
  // ── image variant ──────────────────────────────────────────────────────────
  if (variant === 'image') {
    const ctas = (
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {ctaPrimaryLabel && ctaPrimaryHref && (
          <CtaButton href={ctaPrimaryHref} label={ctaPrimaryLabel} variant="primary" onInk />
        )}
        {ctaSecondaryLabel && ctaSecondaryHref && (
          <CtaButton href={ctaSecondaryHref} label={ctaSecondaryLabel} variant="secondary" onInk />
        )}
      </div>
    )
    return (
      <PhotoHero
        image={image || '/images/site/lab-thermal.jpg'}
        alt=""
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        focal={focalClass(focal)}
        minHeight={minHeight === 'screen' ? 'screen' : undefined}
        footer={note ? <p className="mt-8 text-sm text-white/45">{note}</p> : undefined}
      >
        {(ctaPrimaryLabel && ctaPrimaryHref) || (ctaSecondaryLabel && ctaSecondaryHref)
          ? ctas
          : null}
      </PhotoHero>
    )
  }

  // ── split variant ──────────────────────────────────────────────────────────
  if (variant === 'split') {
    const ink2 = isInk(tone)
    return (
      <section
        className={`px-6 ${padClass(layout) ?? 'py-16 sm:py-20'} ${toneBg(tone)} ${visClass(layout)}`}
      >
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          {/* Text column */}
          <div className={align === 'center' ? 'text-center' : ''}>
            {eyebrow && <Eyebrow ink={ink2}>{eyebrow}</Eyebrow>}
            <DisplayHeading ink={ink2} size="lg" as="h1">
              {title}
            </DisplayHeading>
            {subtitle && <Kicker ink={ink2}>{subtitle}</Kicker>}
            {((ctaPrimaryLabel && ctaPrimaryHref) ||
              (ctaSecondaryLabel && ctaSecondaryHref)) && (
              <div
                className={`mt-8 flex flex-wrap gap-3 ${
                  align === 'center' ? 'justify-center' : ''
                }`}
              >
                {ctaPrimaryLabel && ctaPrimaryHref && (
                  <CtaButton
                    href={ctaPrimaryHref}
                    label={ctaPrimaryLabel}
                    variant="primary"
                    onInk={ink2}
                  />
                )}
                {ctaSecondaryLabel && ctaSecondaryHref && (
                  <CtaButton
                    href={ctaSecondaryHref}
                    label={ctaSecondaryLabel}
                    variant="secondary"
                    onInk={ink2}
                  />
                )}
              </div>
            )}
            {note && (
              <p className={`mt-6 text-sm ${ink2 ? 'text-on-ink-subtle' : 'text-subtle'}`}>
                {note}
              </p>
            )}
          </div>
          {/* Photo column */}
          <div
            className={`w-full rounded-3xl overflow-hidden border ${
              ink2 ? 'border-white/10 shadow-pop' : 'border-border shadow-md'
            }`}
          >
            <SiteImage
              src={image || '/images/site/lab-thermal.jpg'}
              alt=""
              aspect="4/3"
              focal={focalClass(focal)}
              sizes="(min-width: 768px) 40rem, 100vw"
            />
          </div>
        </div>
      </section>
    )
  }

  // ── minimal variant ────────────────────────────────────────────────────────
  const ink3 = isInk(tone)
  return (
    <Band tone={tone} width={width} align={align} layout={layout} defaultPad="py-24 sm:py-32">
      {eyebrow && <Eyebrow ink={ink3}>{eyebrow}</Eyebrow>}
      <DisplayHeading ink={ink3} size="lg" as="h1">
        {title}
      </DisplayHeading>
      {subtitle && <Kicker ink={ink3}>{subtitle}</Kicker>}
      {((ctaPrimaryLabel && ctaPrimaryHref) ||
        (ctaSecondaryLabel && ctaSecondaryHref)) && (
        <div
          className={`mt-8 flex flex-wrap gap-3 ${align === 'center' ? 'justify-center' : ''}`}
        >
          {ctaPrimaryLabel && ctaPrimaryHref && (
            <CtaButton
              href={ctaPrimaryHref}
              label={ctaPrimaryLabel}
              variant="primary"
              onInk={ink3}
            />
          )}
          {ctaSecondaryLabel && ctaSecondaryHref && (
            <CtaButton
              href={ctaSecondaryHref}
              label={ctaSecondaryLabel}
              variant="secondary"
              onInk={ink3}
            />
          )}
        </div>
      )}
      {note && (
        <p className={`mt-6 text-sm ${ink3 ? 'text-on-ink-subtle' : 'text-subtle'}`}>{note}</p>
      )}
    </Band>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CallToAction — conversion band
// ─────────────────────────────────────────────────────────────────────────────

export function CallToActionSection({
  eyebrow,
  heading,
  body,
  ctaPrimaryLabel,
  ctaPrimaryHref,
  ctaSecondaryLabel,
  ctaSecondaryHref,
  tone,
  align,
  layout,
}: {
  eyebrow?: string
  heading: React.ReactNode
  body?: string
  ctaPrimaryLabel?: string
  ctaPrimaryHref?: string
  ctaSecondaryLabel?: string
  ctaSecondaryHref?: string
  tone?: string
  align?: string
  layout?: LayoutValue
}) {
  const ink = isInk(tone)
  const centered = align === 'center'

  // Dark ink variant: full-bleed with light-strip seams + amber glow (matches BetaCTA).
  if (ink) {
    return (
      <section
        className={`relative bg-slat px-6 ${padClass(layout) ?? 'py-24 sm:py-28'} overflow-hidden ${visClass(layout)}`}
      >
        <div className="light-strip absolute inset-x-0 top-0" />
        <div className="light-strip absolute inset-x-0 bottom-0" />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className={`relative max-w-2xl mx-auto ${centered ? 'text-center' : ''}`}>
          {eyebrow && <Eyebrow ink>{eyebrow}</Eyebrow>}
          <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6">
            {heading}
          </h2>
          {body && (
            <p className="text-xl text-on-ink-muted mb-9 leading-relaxed">{body}</p>
          )}
          <div
            className={`flex flex-wrap gap-3 ${centered ? 'justify-center' : ''}`}
          >
            {ctaPrimaryLabel && ctaPrimaryHref && (
              <CtaButton href={ctaPrimaryHref} label={ctaPrimaryLabel} variant="primary" onInk />
            )}
            {ctaSecondaryLabel && ctaSecondaryHref && (
              <CtaButton
                href={ctaSecondaryHref}
                label={ctaSecondaryLabel}
                variant="secondary"
                onInk
              />
            )}
          </div>
        </div>
      </section>
    )
  }

  // Light variants (surface / canvas).
  return (
    <section
      className={`px-6 ${padClass(layout) ?? 'py-24 sm:py-28'} ${toneBg(tone)} ${visClass(layout)}`}
    >
      <div className={`max-w-2xl mx-auto ${centered ? 'text-center' : ''}`}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-6">{heading}</h2>
        {body && <p className="text-xl text-muted mb-9 leading-relaxed">{body}</p>}
        <div className={`flex flex-wrap gap-3 ${centered ? 'justify-center' : ''}`}>
          {ctaPrimaryLabel && ctaPrimaryHref && (
            <CtaButton href={ctaPrimaryHref} label={ctaPrimaryLabel} variant="primary" />
          )}
          {ctaSecondaryLabel && ctaSecondaryHref && (
            <CtaButton
              href={ctaSecondaryHref}
              label={ctaSecondaryLabel}
              variant="secondary"
            />
          )}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote — pull + testimonial variants
// ─────────────────────────────────────────────────────────────────────────────

type QuoteVariant = 'pull' | 'testimonial'

export function QuoteSection({
  variant,
  quote,
  accentWord,
  attribution,
  role,
  avatar,
  tone,
  align,
  width,
  layout,
}: {
  variant: QuoteVariant
  quote?: string
  accentWord?: string
  attribution?: string
  role?: string
  avatar?: string
  tone?: string
  align?: string
  width?: string
  layout?: LayoutValue
}) {
  const ink = isInk(tone)
  const centered = align !== 'left'

  // ── pull variant — reuses PullQuote's visual style inline ─────────────────
  if (variant === 'pull') {
    const bg =
      tone === 'canvas'
        ? 'bg-marketing-canvas'
        : ink
          ? 'bg-slat'
          : 'bg-surface'
    return (
      <section
        className={`${bg} px-6 ${padClass(layout) ?? 'py-20 sm:py-28'} ${visClass(layout)}`}
      >
        <figure className={`max-w-4xl mx-auto ${centered ? 'text-center' : ''}`}>
          <blockquote
            className={`font-display uppercase text-3xl sm:text-4xl lg:text-5xl leading-[1.08] text-balance ${
              ink ? 'text-on-ink' : 'text-text'
            }`}
          >
            {accentize(quote, accentWord)}
          </blockquote>
          {attribution && (
            <figcaption
              className={`mt-7 text-sm font-bold uppercase tracking-[0.25em] ${
                ink ? 'text-on-ink-subtle' : 'text-subtle'
              }`}
            >
              {attribution}
            </figcaption>
          )}
        </figure>
      </section>
    )
  }

  // ── testimonial variant ────────────────────────────────────────────────────
  return (
    <Band tone={tone} width={width} align={align} layout={layout}>
      <figure className={`flex flex-col gap-6 ${centered ? 'items-center text-center' : ''}`}>
        <blockquote
          className={`font-display uppercase text-2xl sm:text-3xl lg:text-4xl leading-[1.1] text-balance ${
            ink ? 'text-on-ink' : 'text-text'
          }`}
        >
          {accentize(quote, accentWord)}
        </blockquote>
        <figcaption className={`flex items-center gap-4 ${centered ? 'flex-col' : ''}`}>
          {avatar && (
            <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 border border-border">
              <Image src={avatar} alt={attribution ?? ''} fill className="object-cover" />
            </div>
          )}
          <div>
            {attribution && (
              <p
                className={`text-base font-bold ${ink ? 'text-on-ink' : 'text-text'}`}
              >
                {attribution}
              </p>
            )}
            {role && (
              <p className={`text-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{role}</p>
            )}
          </div>
        </figcaption>
      </figure>
    </Band>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig registrations
// ─────────────────────────────────────────────────────────────────────────────

export const sectionsComponents: Record<string, ComponentConfig> = {
  // ── Hero ──────────────────────────────────────────────────────────────────
  Hero: {
    label: 'Hero',
    fields: {
      variant: {
        type: 'select',
        label: 'Variant',
        options: [
          { label: 'Image (full-bleed)', value: 'image' },
          { label: 'Split (text + photo)', value: 'split' },
          { label: 'Minimal (text only)', value: 'minimal' },
        ],
      },
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Title' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      subtitle: { type: 'text', label: 'Subtitle / kicker (optional)' },
      image: imgField,
      focal: focalField,
      minHeight: {
        type: 'select',
        label: 'Min height (image variant)',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Full screen', value: 'screen' },
        ],
      },
      ctaPrimaryLabel: { type: 'text', label: 'Primary CTA label' },
      ctaPrimaryHref: { type: 'text', label: 'Primary CTA URL' },
      ctaSecondaryLabel: { type: 'text', label: 'Secondary CTA label (optional)' },
      ctaSecondaryHref: { type: 'text', label: 'Secondary CTA URL (optional)' },
      note: { type: 'text', label: 'Fine-print note (optional)' },
      ...blockFields(),
    },
    defaultProps: {
      variant: 'image',
      eyebrow: 'Welcome',
      title: 'A community that moves at your frequency',
      titleAccent: 'frequency',
      subtitle: 'Join us and make something real.',
      image: '/images/site/lab-thermal.jpg',
      focal: 'center',
      minHeight: 'screen',
      ctaPrimaryLabel: 'Get early access',
      ctaPrimaryHref: '/beta',
      ctaSecondaryLabel: 'Learn more',
      ctaSecondaryHref: '/about',
      note: '',
      ...blockLayoutDefaults,
    },
    render: ({
      variant,
      eyebrow,
      title,
      titleAccent,
      subtitle,
      image,
      focal,
      minHeight,
      ctaPrimaryLabel,
      ctaPrimaryHref,
      ctaSecondaryLabel,
      ctaSecondaryHref,
      note,
      tone,
      align,
      width,
      layout,
    }) => (
      <HeroSection
        variant={(variant as HeroVariant) ?? 'image'}
        eyebrow={eyebrow || undefined}
        title={accentize(title, titleAccent)}
        subtitle={subtitle || undefined}
        image={image || undefined}
        focal={focal}
        minHeight={(minHeight as 'auto' | 'screen') ?? 'screen'}
        ctaPrimaryLabel={ctaPrimaryLabel || undefined}
        ctaPrimaryHref={ctaPrimaryHref || undefined}
        ctaSecondaryLabel={ctaSecondaryLabel || undefined}
        ctaSecondaryHref={ctaSecondaryHref || undefined}
        note={note || undefined}
        tone={tone}
        align={align}
        width={width}
        layout={layout as LayoutValue}
      />
    ),
  },

  // ── CallToAction ───────────────────────────────────────────────────────────
  CallToAction: {
    label: 'Call to Action',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      headingAccent: { type: 'text', label: 'Accent word (optional)' },
      body: { type: 'textarea', label: 'Body (optional)' },
      ctaPrimaryLabel: { type: 'text', label: 'Primary CTA label' },
      ctaPrimaryHref: { type: 'text', label: 'Primary CTA URL' },
      ctaSecondaryLabel: { type: 'text', label: 'Secondary CTA label (optional)' },
      ctaSecondaryHref: { type: 'text', label: 'Secondary CTA URL (optional)' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: '',
      heading: 'Ready to join the community?',
      headingAccent: 'community',
      body: 'Frequency is in early access. Get in now.',
      ctaPrimaryLabel: 'Get early access',
      ctaPrimaryHref: '/beta',
      ctaSecondaryLabel: '',
      ctaSecondaryHref: '',
      ...blockLayoutDefaults,
      tone: 'ink',
      align: 'center',
    },
    render: ({
      eyebrow,
      heading,
      headingAccent,
      body,
      ctaPrimaryLabel,
      ctaPrimaryHref,
      ctaSecondaryLabel,
      ctaSecondaryHref,
      tone,
      align,
      layout,
    }) => (
      <CallToActionSection
        eyebrow={eyebrow || undefined}
        heading={accentize(heading, headingAccent)}
        body={body || undefined}
        ctaPrimaryLabel={ctaPrimaryLabel || undefined}
        ctaPrimaryHref={ctaPrimaryHref || undefined}
        ctaSecondaryLabel={ctaSecondaryLabel || undefined}
        ctaSecondaryHref={ctaSecondaryHref || undefined}
        tone={tone}
        align={align}
        layout={layout as LayoutValue}
      />
    ),
  },

  // ── Quote ──────────────────────────────────────────────────────────────────
  Quote: {
    label: 'Quote',
    fields: {
      variant: {
        type: 'select',
        label: 'Variant',
        options: [
          { label: 'Pull quote', value: 'pull' },
          { label: 'Testimonial', value: 'testimonial' },
        ],
      },
      quote: { type: 'textarea', label: 'Quote text' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      attribution: { type: 'text', label: 'Attribution / name' },
      role: { type: 'text', label: 'Role / title (testimonial only)' },
      avatar: { ...imgField, label: 'Avatar photo (testimonial only)' },
      ...blockFields(),
    },
    defaultProps: {
      variant: 'pull',
      quote: 'The best communities don\'t just talk, they make.',
      accentWord: 'make',
      attribution: 'Community member',
      role: '',
      avatar: '',
      ...blockLayoutDefaults,
      tone: 'canvas',
      align: 'center',
    },
    render: ({
      variant,
      quote,
      accentWord,
      attribution,
      role,
      avatar,
      tone,
      align,
      width,
      layout,
    }) => (
      <QuoteSection
        variant={(variant as QuoteVariant) ?? 'pull'}
        quote={quote || undefined}
        accentWord={accentWord || undefined}
        attribution={attribution || undefined}
        role={role || undefined}
        avatar={avatar || undefined}
        tone={tone}
        align={align}
        width={width}
        layout={layout as LayoutValue}
      />
    ),
  },
}
