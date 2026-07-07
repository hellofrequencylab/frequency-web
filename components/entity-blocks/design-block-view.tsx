import type { ReactNode } from 'react'
import { safeUrl } from '@/lib/entity-blocks/block-content'
import { DESIGN_ENTITY_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import {
  PhotoHeroBlock,
  EditorialSectionBlock,
  CardGridBlock,
  ZigzagBlock,
  AccentBeatBlock,
} from '@/components/page-editor/blocks/design'

// THE DESIGN-BLOCK ADAPTER (2026): renders the five reusable design blocks (PhotoHero / EditorialSection /
// CardGrid / Zigzag / AccentBeat) from the entity-block AUTHORED bag, so they render in the on-page rail
// arranger the same way the connected sections do. Each design component is a plain server component taking
// props (components/page-editor/blocks/design.tsx); this adapter maps the rail's authored fields onto those
// props and fills the richer Puck-only controls (variant, scrim, body mode, per-card image) with sensible
// defaults, until the arranger's field kit grows those controls. Server-safe (no hooks), FAIL-SAFE (an empty
// bag renders the component's own honest-empty state). Every value is already sanitized by
// lib/entity-blocks/block-content (strings bounded, urls made safe).

const DESIGN_SET: ReadonlySet<string> = new Set(DESIGN_ENTITY_BLOCK_IDS)

/** Whether an id is one of the five design blocks (drives the render dispatch in both render paths). */
export function isDesignBlock(id: string): boolean {
  return DESIGN_SET.has(id)
}

function s(props: Record<string, unknown>, key: string): string | undefined {
  const v = props[key]
  return typeof v === 'string' && v.trim() ? v : undefined
}

/** Render ONE design block by id from its authored bag, or null for a non-design id. */
export function DesignBlockView({ id, props }: { id: string; props: Record<string, unknown> }): ReactNode {
  switch (id) {
    case 'photoHero': {
      const image = safeUrl(props.image) || undefined
      return (
        <PhotoHeroBlock
          variant={image ? 'image' : 'wash'}
          image={image}
          alt={s(props, 'alt')}
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          subtitle={s(props, 'subtitle')}
          actionPrimaryLabel={s(props, 'buttonLabel')}
          actionPrimaryHref={safeUrl(props.buttonUrl) || undefined}
        />
      )
    }
    case 'editorial':
      return (
        <EditorialSectionBlock
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          body="prose"
          lead={s(props, 'body')}
        />
      )
    case 'cardGrid': {
      // The rail edits cards through the shared "features" repeater ({icon, title, text}); map text → the
      // card body so a card grid authored in the arranger renders its cards.
      const items = Array.isArray(props.cards)
        ? (props.cards as Array<{ icon?: unknown; title?: unknown; text?: unknown }>)
            .map((it) => ({
              icon: typeof it.icon === 'string' ? it.icon : undefined,
              title: typeof it.title === 'string' ? it.title : undefined,
              body: typeof it.text === 'string' ? it.text : undefined,
            }))
            .filter((c) => c.title || c.body)
        : []
      const browseHref = safeUrl(props.browseUrl) || undefined
      return (
        <CardGridBlock
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          role="feature"
          columns={3}
          cards={items}
          browseLabel={s(props, 'browseLabel')}
          browseHref={browseHref}
        />
      )
    }
    case 'zigzag': {
      const image = safeUrl(props.image) || undefined
      return (
        <ZigzagBlock
          image={image}
          alt={s(props, 'alt')}
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          body="lead"
          lead={s(props, 'body')}
          mediaSide="left"
          background="canvas"
        />
      )
    }
    case 'accentBeat':
      return (
        <AccentBeatBlock
          background="accent-wash"
          mode="cta"
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          body={s(props, 'body')}
          ctaLabel={s(props, 'buttonLabel')}
          ctaHref={safeUrl(props.buttonUrl) || undefined}
        />
      )
    default:
      return null
  }
}
