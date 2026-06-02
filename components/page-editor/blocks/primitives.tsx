// Layout & Primitives block library — standardized structural + basic-content
// Puck blocks. Every block composes from the frozen kit contract (Band, atoms,
// blockFields, blockLayoutDefaults) and the shared field resolvers. DO NOT edit
// kit.tsx, fields.tsx, layout.ts, richtext.tsx, or config.tsx.

import {
  Band,
  CtaButton,
  accentize,
  blockFields,
  blockLayoutDefaults,
  padClass,
  visClass,
  layoutField,
  layoutDefault,
  toneField,
  widthField,
  alignField,
  type LayoutValue,
  type ComponentConfig,
  type CtaVariant,
} from './kit'
import { Statement } from '@/components/marketing/marketing-ui'
import { toneBg, isInk, widthClass } from '@/lib/page-editor/fields'
import { richParagraphs } from '@/lib/page-editor/richtext'

// ─────────────────────────────────────────────────────────────────────────────
// 1. Text — rich body-copy block
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_SIZE: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-lg',
  lg: 'text-xl',
}

export function TextBlock({
  body,
  size,
}: {
  body?: string
  size?: string
}) {
  const sz = TEXT_SIZE[size ?? 'base'] ?? TEXT_SIZE.base
  return (
    <div className={`${sz} text-muted leading-relaxed space-y-4`}>
      {richParagraphs(body)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Buttons — button group
// ─────────────────────────────────────────────────────────────────────────────

export function ButtonsBlock({
  items,
  align,
  ink,
}: {
  items: { label: string; href: string; variant: CtaVariant }[]
  align?: string
  ink?: boolean
}) {
  const justifyClass = align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <div className={`flex flex-wrap gap-4 ${justifyClass}`}>
      {(items ?? []).map((item, i) => (
        <CtaButton
          key={i}
          href={item.href}
          label={item.label}
          variant={item.variant ?? 'primary'}
          onInk={ink}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Container — section wrapper with a nested-block slot
// ─────────────────────────────────────────────────────────────────────────────

// (No presentational sub-component needed — render is fully inline below.)

// ─────────────────────────────────────────────────────────────────────────────
// 4. Columns — 2/3-column slot layout
// ─────────────────────────────────────────────────────────────────────────────

const GAP: Record<string, string> = {
  sm: 'gap-4',
  md: 'gap-8',
  lg: 'gap-12',
}

// ─────────────────────────────────────────────────────────────────────────────
// primitivesComponents — the Puck ComponentConfig registry
// ─────────────────────────────────────────────────────────────────────────────

export const primitivesComponents: Record<string, ComponentConfig> = {
  // ── 1. Text ────────────────────────────────────────────────────────────────
  Text: {
    label: 'Text',
    fields: {
      body: {
        type: 'textarea',
        label: 'Body (**bold**, *italic*, [link](/path))',
      },
      size: {
        type: 'select',
        label: 'Size',
        options: [
          { label: 'Small', value: 'sm' },
          { label: 'Normal', value: 'base' },
          { label: 'Large', value: 'lg' },
        ],
      },
      ...blockFields(),
    },
    defaultProps: {
      body: 'Write something here. **Bold**, *italic*, and [links](/the-lab) all work.',
      size: 'base',
      ...blockLayoutDefaults,
    },
    render: ({ body, size, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <TextBlock body={body as string} size={size as string} />
      </Band>
    ),
  },

  // ── Statement — big typographic interstitial ─────────────────────────────────
  Statement: {
    label: 'Statement',
    fields: {
      text: { type: 'textarea', label: 'Statement' },
      accent: { type: 'text', label: 'Accent word (optional)' },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: { text: 'A bold statement.', accent: '', tone: 'canvas', layout: layoutDefault },
    render: ({ text, accent, tone, layout }) => (
      <Statement
        tone={(tone === 'none' ? 'surface' : tone) as 'surface' | 'canvas' | 'ink'}
        pad={padClass(layout as LayoutValue)}
        vis={visClass(layout as LayoutValue)}
      >
        {accentize(text as string, accent as string)}
      </Statement>
    ),
  },

  // ── 2. Buttons ─────────────────────────────────────────────────────────────
  Buttons: {
    label: 'Buttons',
    fields: {
      items: {
        type: 'array',
        label: 'Buttons',
        arrayFields: {
          label: { type: 'text', label: 'Label' },
          href: { type: 'text', label: 'Link' },
          variant: {
            type: 'select',
            label: 'Variant',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
              { label: 'Ghost', value: 'ghost' },
            ],
          },
        },
        getItemSummary: (item: { label?: string }) => item.label || 'Button',
      },
      align: alignField,
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      items: [{ label: 'Get started', href: '/beta', variant: 'primary' }],
      align: 'left',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ items, align, tone, layout }) => (
      <Band tone={tone} width="full" align={align} layout={layout as LayoutValue}>
        <ButtonsBlock
          items={items as { label: string; href: string; variant: CtaVariant }[]}
          align={align as string}
          ink={isInk(tone as string)}
        />
      </Band>
    ),
  },

  // ── 3. Container ───────────────────────────────────────────────────────────
  Container: {
    label: 'Container',
    fields: {
      tone: toneField,
      width: widthField,
      padding: layoutField,
      content: { type: 'slot' },
    },
    defaultProps: {
      tone: 'surface',
      width: 'default',
      padding: layoutDefault,
      content: [],
    },
    render: ({ tone, width, padding, content: Content }) => (
      <section
        className={`px-6 ${padClass(padding as LayoutValue) ?? 'py-16 sm:py-20'} ${toneBg(tone as string)} ${visClass(padding as LayoutValue)}`}
      >
        <div className={`${widthClass(width as string)} mx-auto`}>
          <Content />
        </div>
      </section>
    ),
  },

  // ── 4. Columns ─────────────────────────────────────────────────────────────
  Columns: {
    label: 'Columns',
    fields: {
      count: {
        type: 'radio',
        label: 'Columns',
        options: [
          { label: '2', value: '2' },
          { label: '3', value: '3' },
        ],
      },
      gap: {
        type: 'select',
        label: 'Gap',
        options: [
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' },
        ],
      },
      valign: {
        type: 'select',
        label: 'Vertical align',
        options: [
          { label: 'Top', value: 'top' },
          { label: 'Center', value: 'center' },
        ],
      },
      tone: toneField,
      col1: { type: 'slot' },
      col2: { type: 'slot' },
      col3: { type: 'slot' },
      layout: layoutField,
    },
    defaultProps: {
      count: '2',
      gap: 'md',
      valign: 'top',
      tone: 'surface',
      col1: [],
      col2: [],
      col3: [],
      layout: layoutDefault,
    },
    render: ({ count, gap, valign, tone, col1: Col1, col2: Col2, col3: Col3, layout }) => {
      const n = count === '3' ? 3 : 2
      const gapCls = GAP[gap as string] ?? GAP.md
      return (
        <section
          className={`px-6 ${padClass(layout as LayoutValue) ?? 'py-12 sm:py-16'} ${toneBg(tone as string)} ${visClass(layout as LayoutValue)}`}
        >
          <div
            className={`max-w-5xl mx-auto grid ${gapCls} ${n === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} ${
              valign === 'center' ? 'items-center' : 'items-start'
            }`}
          >
            <Col1 />
            <Col2 />
            {n === 3 && <Col3 />}
          </div>
        </section>
      )
    },
  },

  // ── 5. Spacer ──────────────────────────────────────────────────────────────
  Spacer: {
    label: 'Spacer',
    fields: {
      size: {
        type: 'select',
        label: 'Size',
        options: [
          { label: 'Small', value: '2rem' },
          { label: 'Medium', value: '4rem' },
          { label: 'Large', value: '7rem' },
        ],
      },
    },
    defaultProps: {
      size: '4rem',
    },
    render: ({ size }) => <div style={{ height: size as string }} />,
  },

  // ── 6. Divider ─────────────────────────────────────────────────────────────
  Divider: {
    label: 'Divider',
    fields: {
      width: widthField,
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      width: 'default',
      tone: 'none',
      layout: layoutDefault,
    },
    render: ({ width, tone, layout }) => (
      <section
        className={`px-6 ${padClass(layout as LayoutValue) ?? 'py-4'} ${toneBg(tone as string)} ${visClass(layout as LayoutValue)}`}
      >
        <div className={`${widthClass(width as string)} mx-auto`}>
          <hr className="border-border" />
        </div>
      </section>
    ),
  },
}
