// Media block library — standardized image, text+image, gallery, and marquee
// blocks for the Puck page-builder. All blocks compose from the frozen kit
// contract (fields, atoms, Band) and DAWN design tokens only.
//
// Keys:  MediaText | Image | Gallery | Marquee
// Category: Media

import { ZigZag } from '@/components/marketing/marketing-ui'
import { Marquee as MarqueeStrip } from '@/components/marketing/marketing-ui'
import { SiteImage } from '@/components/marketing/site-image'
import { richParagraphs } from '@/lib/page-editor/richtext'
import {
  focalField,
  aspectField,
  sizeField,
  radiusField,
  shadowField,
  focalClass,
  radiusClass,
  shadowClass,
  sizeClass,
  aspectValue,
} from '@/lib/page-editor/image-controls'
import {
  Eyebrow,
  accentize,
  toneField,
  alignField,
  toneBg,
  isInk,
  widthClass,
  alignClass,
  layoutField,
  layoutDefault,
  padClass,
  visClass,
  blockFields,
  blockLayoutDefaults,
  type LayoutValue,
  type ComponentConfig,
} from './kit'
import {
  imgField,
  emphasisField,
  emphasisDefault,
  emphasisClasses,
  cardStyleField,
  cardStyleDefault,
  cardStyleClass,
  densityField,
  densityDefault,
  densityClasses,
  type EmphasisValue,
  type CardStyleValue,
  type DensityValue,
} from '@/lib/page-editor/fields'

// ─────────────────────────────────────────────────────────────────────────────
// 1. MediaText — alternating image + text row (standardizes the old ZigZag)
// ─────────────────────────────────────────────────────────────────────────────

export function MediaTextBlock({
  image,
  alt,
  eyebrow,
  title,
  kicker,
  body,
  cta,
  reverse,
  tone,
  imgAspect,
  imgPosition,
  pad,
  vis,
}: {
  image: string
  alt: string
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
  body?: string
  cta?: { label: string; href: string }
  reverse?: boolean
  tone?: 'surface' | 'canvas' | 'ink'
  imgAspect?: 'landscape' | 'portrait' | 'square' | 'natural'
  imgPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  pad?: string
  vis?: string
}) {
  return (
    <ZigZag
      img={image || '/images/site/community-1.jpg'}
      alt={alt || ''}
      eyebrow={eyebrow || undefined}
      title={title}
      kicker={kicker || undefined}
      reverse={reverse}
      tone={tone ?? 'surface'}
      imgAspect={imgAspect ?? 'landscape'}
      imgPosition={imgPosition ?? 'center'}
      cta={cta}
      pad={pad}
      vis={vis}
    >
      {richParagraphs(body)}
    </ZigZag>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ImageBlock — single full-width image band (standardizes the old ImageBand)
// ─────────────────────────────────────────────────────────────────────────────

export function ImageBlock({
  image,
  alt,
  aspect,
  focal,
  size,
  radius,
  shadow,
  caption,
  tone,
  align,
  pad,
  vis,
}: {
  image: string
  alt: string
  aspect?: string
  focal?: string
  size?: string
  radius?: string
  shadow?: string
  caption?: string
  tone?: string
  align?: string
  pad?: string
  vis?: string
}) {
  const ar = aspectValue(aspect)
  // `size` is the image width; `align` justifies it within the band (left/center).
  const justify = align === 'left' ? 'mr-auto' : 'mx-auto'
  return (
    <div className={`px-6 ${pad ?? 'py-4'} ${toneBg(tone)} ${vis ?? ''}`}>
      <div
        className={`${sizeClass(size)} ${justify} overflow-hidden border border-border ${radiusClass(radius)} ${shadowClass(shadow)}`}
      >
        <SiteImage
          src={image || '/images/site/lab-storefront.jpg'}
          alt={alt || ''}
          aspect={ar}
          focal={focalClass(focal)}
          sizes="(min-width: 1024px) 64rem, 100vw"
        />
      </div>
      {caption && (
        <p className={`mt-3 text-sm text-center ${isInk(tone) ? 'text-on-ink-muted' : 'text-subtle'}`}>{caption}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GalleryMediaBlock — image grid (standardizes the old FeatureGallery)
// ─────────────────────────────────────────────────────────────────────────────

const GALLERY_COLS: Record<string, string> = {
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-2 lg:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
}

export function GalleryMediaBlock({
  eyebrow,
  heading,
  items,
  columns,
  tileAspect,
  tone,
  width,
  align,
  pad,
  vis,
  emphasis,
  cardStyle,
  density,
}: {
  eyebrow?: string
  heading?: string
  items: { image?: string; title?: string; body?: string }[]
  columns?: string
  tileAspect?: string
  tone?: string
  width?: string
  align?: string
  pad?: string
  vis?: string
  emphasis?: EmphasisValue
  cardStyle?: CardStyleValue
  density?: DensityValue
}) {
  const ink = isInk(tone)
  const cols = GALLERY_COLS[columns ?? '2'] ?? GALLERY_COLS['2']
  // `cardStyle` owns each tile's treatment + corner radius. Emphasis sizes and
  // accents the heading; density drives the grid gap and each tile's inner
  // caption padding.
  const { scale, accent } = emphasisClasses(emphasis)
  const tileClass = cardStyleClass(cardStyle, ink)
  const { gap, pad: itemPad } = densityClasses(density)
  return (
    <section className={`px-6 ${pad ?? 'py-16 sm:py-20'} ${toneBg(tone)} ${vis ?? ''}`}>
      <div className={`${widthClass(width)} mx-auto ${alignClass(align)}`}>
        {(eyebrow || heading) && (
          <div className="mb-8">
            {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
            {heading && (
              <h2 className={`font-display uppercase text-balance ${scale} ${accent || (ink ? 'text-on-ink' : 'text-text')}`}>
                {heading}
              </h2>
            )}
          </div>
        )}
        <div className={`grid grid-cols-1 ${cols} ${gap} text-left`}>
          {(items || []).map((f, i) => (
            <article key={i} className={`overflow-hidden ${tileClass}`}>
              <SiteImage
                src={f.image || '/images/site/lab-pool.jpg'}
                alt={f.title || ''}
                aspect={tileAspect ?? '16/10'}
                sizes="(min-width: 640px) 40rem, 100vw"
              />
              <div className={itemPad}>
                {f.title && <h3 className={`text-xl font-bold mb-1.5 ${ink ? 'text-on-ink' : 'text-text'}`}>{f.title}</h3>}
                {f.body && <p className={`text-base leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{f.body}</p>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MarqueeBlock — scrolling text strip (standardizes the old Marquee)
// ─────────────────────────────────────────────────────────────────────────────

export function MarqueeBlock({
  items,
  vis,
}: {
  items: { text: string }[]
  vis?: string
}) {
  return (
    <section className={`bg-slat ${vis ?? ''}`}>
      <MarqueeStrip items={(items || []).map((i) => i.text || '')} />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map — exported as mediaComponents
// ─────────────────────────────────────────────────────────────────────────────

export const mediaComponents: Record<string, ComponentConfig> = {
  MediaText: {
    label: 'Media + Text',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      body: { type: 'textarea', label: 'Body (**bold**, *italic*, [link](/path))' },
      side: {
        type: 'radio',
        label: 'Image side',
        options: [
          { label: 'Image left', value: 'left' },
          { label: 'Image right', value: 'right' },
        ],
      },
      imgAspect: {
        type: 'select',
        label: 'Image crop',
        options: [
          { label: 'Landscape', value: 'landscape' },
          { label: 'Portrait', value: 'portrait' },
          { label: 'Square', value: 'square' },
          { label: 'Natural (uncropped)', value: 'natural' },
        ],
      },
      focal: focalField,
      ctaLabel: { type: 'text', label: 'CTA label (optional)' },
      ctaHref: { type: 'text', label: 'CTA link (optional)' },
      ...blockFields(),
    },
    defaultProps: {
      image: '',
      alt: '',
      eyebrow: 'Eyebrow',
      title: 'Section heading',
      titleAccent: '',
      kicker: '',
      body: 'Body copy.',
      side: 'left',
      imgAspect: 'landscape',
      focal: 'center',
      ctaLabel: '',
      ctaHref: '',
      ...blockLayoutDefaults,
    },
    render: ({
      image,
      alt,
      eyebrow,
      title,
      titleAccent,
      kicker,
      body,
      side,
      imgAspect,
      focal,
      ctaLabel,
      ctaHref,
      tone,
      layout,
    }) => (
      <MediaTextBlock
        image={image as string}
        alt={alt as string}
        eyebrow={(eyebrow as string) || undefined}
        title={accentize(title as string, titleAccent as string)}
        kicker={(kicker as string) || undefined}
        body={body as string}
        reverse={side === 'right'}
        tone={tone as 'surface' | 'canvas' | 'ink'}
        imgAspect={imgAspect as 'landscape' | 'portrait' | 'square' | 'natural'}
        imgPosition={focal as 'center' | 'top' | 'bottom' | 'left' | 'right'}
        cta={ctaLabel && ctaHref ? { label: ctaLabel as string, href: ctaHref as string } : undefined}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  Image: {
    label: 'Image',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      aspect: aspectField,
      focal: focalField,
      size: { ...sizeField, label: 'Width' },
      radius: radiusField,
      shadow: shadowField,
      caption: { type: 'textarea', label: 'Caption (optional)' },
      // Width is the image's own `size`; expose Background + Align for parity.
      tone: toneField,
      align: alignField,
      layout: layoutField,
    },
    defaultProps: {
      image: '',
      alt: '',
      aspect: '21/9',
      focal: 'center',
      size: 'xl',
      radius: 'lg',
      shadow: 'sm',
      caption: '',
      tone: 'surface',
      align: 'center',
      layout: layoutDefault,
    },
    render: ({ image, alt, aspect, focal, size, radius, shadow, caption, tone, align, layout }) => (
      <ImageBlock
        image={image as string}
        alt={alt as string}
        aspect={aspect as string}
        focal={focal as string}
        size={size as string}
        radius={radius as string}
        shadow={shadow as string}
        caption={(caption as string) || undefined}
        tone={tone as string}
        align={align as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  Gallery: {
    label: 'Gallery',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      heading: { type: 'textarea', label: 'Heading (optional)' },
      items: {
        type: 'array',
        arrayFields: {
          image: imgField,
          title: { type: 'textarea', label: 'Title (optional)' },
          body: { type: 'textarea', label: 'Caption (optional)' },
        },
        getItemSummary: (i: { title?: string }) => i.title || 'Tile',
      },
      columns: {
        type: 'select',
        label: 'Columns',
        options: [
          { label: '2 columns', value: '2' },
          { label: '3 columns', value: '3' },
          { label: '4 columns', value: '4' },
        ],
      },
      tileAspect: {
        type: 'select',
        label: 'Tile crop',
        options: [
          { label: 'Landscape (16:10)', value: '16/10' },
          { label: 'Wide (16:9)', value: '16/9' },
          { label: 'Photo (3:2)', value: '3/2' },
          { label: 'Square (1:1)', value: '1/1' },
          { label: 'Portrait (4:5)', value: '4/5' },
        ],
      },
      emphasis: emphasisField,
      cardStyle: cardStyleField,
      density: densityField,
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: '',
      heading: '',
      items: [],
      columns: '2',
      tileAspect: '16/10',
      emphasis: emphasisDefault,
      cardStyle: cardStyleDefault,
      density: densityDefault,
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, heading, items, columns, tileAspect, emphasis, cardStyle, density, tone, width, align, layout }) => (
      <GalleryMediaBlock
        eyebrow={(eyebrow as string) || undefined}
        heading={(heading as string) || undefined}
        items={(items as { image?: string; title?: string; body?: string }[]) || []}
        columns={columns as string}
        tileAspect={tileAspect as string}
        emphasis={emphasis as EmphasisValue}
        cardStyle={cardStyle as CardStyleValue}
        density={density as DensityValue}
        tone={tone as string}
        width={width as string}
        align={align as string}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  Marquee: {
    label: 'Marquee',
    fields: {
      items: {
        type: 'array',
        arrayFields: {
          text: { type: 'text' },
        },
        getItemSummary: (i: { text?: string }) => i.text || 'Item',
      },
      layout: layoutField,
    },
    defaultProps: {
      items: [{ text: "What we’re building" }],
      layout: layoutDefault,
    },
    render: ({ items, layout }) => (
      <MarqueeBlock
        items={(items as { text: string }[]) || []}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },
}
