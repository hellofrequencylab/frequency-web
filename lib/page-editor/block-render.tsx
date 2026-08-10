import { Fragment, type CSSProperties, type ReactNode } from 'react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'

// A block the current config cannot resolve — a type that was renamed or retired while
// stored documents still name it. The document ALWAYS keeps it (the loader no longer
// discards a document over one unknown type, ADR-978), so the only question is what
// the author sees.
//
// Editing: a labelled placeholder, so the block is visibly still there and cannot be
// mistaken for empty space and "tidied" away. Live: nothing at all — a visitor must never
// meet editor scaffolding. The props ride through untouched either way, so saving the page
// round-trips the block byte-for-byte.
function UnknownBlock({ type, isEditing }: { type: string; isEditing?: boolean }) {
  if (!isEditing) return null
  return (
    <div className="mx-auto my-2 max-w-3xl rounded-card border border-dashed border-border bg-surface-elevated px-4 py-3">
      <p className="text-body-sm font-medium text-text">This block is not available in this version</p>
      <p className="mt-0.5 text-body-sm text-muted">
        <code>{type}</code> is kept exactly as saved and will publish unchanged. It shows nothing on the live page.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BlockRender — the in-house read/render path for Puck-format page documents.
//
// This is a faithful, dependency-free reimplementation of `@measured/puck/rsc`'s
// `<Render>`. It walks a Puck `Data` document ({ content, root, zones? }) and
// invokes the SAME block `render` functions the editor uses (config.components
// [type].render / config.root.render), threading the `puck` object (metadata +
// the drop-zone / slot renderer) exactly the way Puck does.
//
// Why in-house: it lets us drop the `@measured/puck` runtime from the public
// read path while keeping byte-identical output. Parity against Puck's own rsc
// `<Render>` is proven in block-render.test.tsx (renderToStaticMarkup deep-equal).
//
// Contract mirrored from Puck 0.20.2 (node_modules/@measured/puck/dist/rsc.mjs +
// chunk-OOLYDXKW.mjs):
//   • Render → config.root.render({ ...rootProps, puck, title, editMode, id },
//              children: <root content zone>)
//   • root content zone → a Fragment of mapped items (NO wrapper div). NOTE the
//     CLIENT `@measured/puck` <Render> wraps this in a <div>; the rsc render does
//     not. We match the rsc render (the canonical SSR/public path).
//   • each item → config.components[type].render({ ...item.props, <slots>, puck })
//   • slot-typed fields are replaced by a Slot component that renders
//     <div>{nested items}</div>, recursing per child (each child re-runs the slot
//     transform + gets puck: { metadata }).
//   • unknown item.type → skipped (null), never thrown; empty/missing doc → nothing.
//
// ONE DELIBERATE DIVERGENCE from Puck's rsc <Render>: `puck.isEditing`. Puck's rsc
// render is a public-only path, so it can hardcode `false`; ours is ALSO the editor
// canvas (DesktopEditor / MobileEditor / the mobile BlockList preview all render the
// document through this component). `isEditing` is therefore a real prop, defaulting
// to `false`, and every editor surface passes `isEditing`. Blocks read it as
// `puck.isEditing` to show an authoring placeholder for a section that would render
// nothing — a placeholder a visitor must never meet (ADR-927). It rides on the SAME
// puck object at every depth, including inside slots, so a block behaves the same
// nested in a SpaceLayout as it does at the top level.
//
// No hooks are used (Puck's rsc render leans on useMemo via useSlots; the memo is
// pure so we inline it), which keeps BlockRender safe as a Server Component AND
// inside client trees.
// ─────────────────────────────────────────────────────────────────────────────

// Zone/area constants — mirror Puck's lib/root-droppable-id.ts.
const rootAreaId = 'root'
const rootZone = 'default-zone'

type AnyProps = Record<string, unknown>
type Item = { type: string; props: AnyProps }
type Field = {
  type?: string
  arrayFields?: Fields
  objectFields?: Fields
}
type Fields = Record<string, Field>

interface RenderableComponent {
  render: (props: AnyProps) => ReactNode
  fields?: Fields
}
interface RenderableConfig {
  root?: { render?: (props: AnyProps) => ReactNode; fields?: Fields }
  components: Record<string, RenderableComponent | undefined>
}
type RenderableData = {
  content?: Item[]
  root?: AnyProps
  zones?: Record<string, Item[]>
}

// Everything the walk needs to render a block, threaded as ONE value so the render
// channel (`puck`) can never disagree between depths. `isEditing` is TRUE only when an
// editor canvas is rendering the tree; a public page always leaves it false.
type RenderCtx = {
  config: RenderableConfig
  metadata: Metadata
  isEditing: boolean
}

// ── Slot field transform (mirrors lib/data/default-slots + map-fields, sync,
// recurseSlots=false — nested slots are resolved lazily per child by SlotItem). ──

// Ensure every slot-typed field has at least an empty array (Puck: defaultSlots).
function defaultSlots(props: AnyProps, fields: Fields): AnyProps {
  return Object.keys(fields).reduce<AnyProps>(
    (acc, name) => (fields[name]?.type === 'slot' ? { [name]: [], ...acc } : acc),
    props,
  )
}

// The component a slot-typed prop is replaced with. When a block renders it
// (e.g. `<Content />`), it produces <div>{children}</div>, matching Puck's
// SlotRender. `dzProps` (className/style) a block may pass through are forwarded.
// (Puck also threads `allow`/`disallow`/`zone` here, but SlotRender never reads
// them, so they're omitted — output is identical.)
type SlotComponent = (dzProps?: { className?: string; style?: CSSProperties }) => ReactNode

function makeSlot(content: Item[], ctx: RenderCtx): SlotComponent {
  const Slot: SlotComponent = (dzProps) => <SlotRender {...dzProps} content={content} ctx={ctx} />
  return Slot
}

// walkField / walkObject — a faithful port of Puck's map-fields walk restricted
// to the slot mapper (the only transform the render path applies).
function walkField(
  value: unknown,
  fields: Fields,
  propKey: string,
  propPath: string,
  ctx: RenderCtx,
): unknown {
  const fieldType = fields[propKey]?.type
  if (fieldType === 'slot') {
    const content = (value ?? []) as Item[]
    return makeSlot(content, ctx)
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      const arrayFields = fields[propKey]?.type === 'array' ? fields[propKey]?.arrayFields : undefined
      if (!arrayFields) return value
      return value.map((el, idx) => walkField(el, arrayFields, propKey, `${propPath}[${idx}]`, ctx))
    }
    if ('$$typeof' in (value as object)) return value // React element — leave intact
    const objectFields = fields[propKey]?.type === 'object' ? (fields[propKey]?.objectFields ?? {}) : fields
    return walkObject(value as AnyProps, objectFields, (k) => `${propPath}.${k}`, ctx)
  }
  return value
}

function walkObject(
  value: AnyProps,
  fields: Fields,
  getPropPath: (k: string) => string,
  ctx: RenderCtx,
): AnyProps {
  const out: AnyProps = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = walkField(v, fields, k, getPropPath(k), ctx)
  }
  return out
}

// Resolve a single item's props with its slot fields swapped for Slot components.
// Mirrors useSlots' mergedProps = { ...item.props, ...mapFields(item).props }.
function propsWithSlots(item: { type?: string; props?: AnyProps }, ctx: RenderCtx): AnyProps {
  const itemType = item.type ?? 'root'
  const componentConfig = itemType === 'root' ? ctx.config.root : ctx.config.components[itemType]
  const fields = componentConfig?.fields ?? {}
  const props = item.props ?? {}
  const transformed = walkObject(defaultSlots(props, fields), fields, (k) => k, ctx)
  return { ...props, ...transformed }
}

// ── Slot rendering (mirrors components/SlotRender/server.tsx) ──

function SlotRender({
  className,
  style,
  content,
  ctx,
}: {
  className?: string
  style?: CSSProperties
  content: Item[]
  ctx: RenderCtx
}) {
  return (
    <div className={className} style={style}>
      {content.map((item) => {
        if (!ctx.config.components[item.type])
          // `item.props` is optional-chained: isWellFormed only guarantees a `type`, so a
          // hand-edited or partially-migrated row can reach here with no props at all.
          // Before ADR-978 such a row was rejected by the loader and never rendered.
          return (
            <UnknownBlock key={item.props?.id as string} type={item.type} isEditing={ctx.isEditing} />
          )
        return <SlotItem key={item.props.id as string} item={item} ctx={ctx} />
      })}
    </div>
  )
}

// One nested slot child: re-run the slot transform for its own props, then render
// it with puck: { ...props.puck, metadata, isEditing } (nested items carry the render
// channel only — no renderDropZone — as Puck's SlotRender/Item does). `isEditing`
// rides along so a block behaves identically inside a slot and at the top level;
// without it a Space page arranged by a layout preset (which wraps blocks into a
// SpaceLayout's slots) would lose every authoring placeholder.
function SlotItem({ item, ctx }: { item: Item; ctx: RenderCtx }) {
  const component = ctx.config.components[item.type]!
  const props = propsWithSlots(item, ctx)
  const Component = component.render
  return (
    <Component
      {...props}
      puck={{
        ...(props.puck as AnyProps | undefined),
        metadata: ctx.metadata || {},
        isEditing: ctx.isEditing,
      }}
    />
  )
}

// ── Content zone (mirrors components/ServerRender DropZoneRender) ──

function DropZoneRender({
  zone,
  data,
  areaId = rootAreaId,
  ctx,
}: {
  zone: string
  data: RenderableData
  areaId?: string
  ctx: RenderCtx
}) {
  if (!data || !ctx.config) return null
  let content: Item[] = data.content ?? []
  // Legacy pre-slot `zones` map: only consulted for a non-root area/zone.
  if (areaId !== rootAreaId && zone !== rootZone) {
    const zoneCompound = `${areaId}:${zone}`
    content = (data.zones?.[zoneCompound] ?? []) as Item[]
  }
  return (
    <Fragment>
      {content.map((item) => {
        const component = ctx.config.components[item.type]
        const baseProps: AnyProps = {
          ...item.props,
          puck: {
            renderDropZone: ({ zone: z }: { zone: string }) => (
              <DropZoneRender zone={z} data={data} areaId={item.props.id as string} ctx={ctx} />
            ),
            metadata: ctx.metadata,
            dragRef: null,
            isEditing: ctx.isEditing,
          },
        }
        if (!component)
          return (
            <UnknownBlock key={item.props?.id as string} type={item.type} isEditing={ctx.isEditing} />
          )
        const resolved = propsWithSlots({ type: item.type, props: baseProps }, ctx)
        const Component = component.render
        return <Component key={item.props.id as string} {...resolved} />
      })}
    </Fragment>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BlockRender — the public entry point. Drop-in for `@measured/puck/rsc`'s
// <Render config data metadata />. Safe as a Server Component and in client trees.
// ─────────────────────────────────────────────────────────────────────────────
export function BlockRender({
  config,
  data,
  metadata = {},
  isEditing = false,
}: {
  config: Config
  data: Data
  metadata?: Metadata
  /** TRUE only on an EDITOR canvas (DesktopEditor / MobileEditor / the mobile block
   *  preview). Blocks read it as `puck.isEditing` and use it to show an authoring
   *  placeholder for a section that would otherwise render nothing. A public page must
   *  never pass it: the placeholders are operator scaffolding, not visitor content. */
  isEditing?: boolean
}) {
  const cfg = config as unknown as RenderableConfig
  const doc = (data ?? {}) as RenderableData
  const root = (doc.root ?? {}) as AnyProps
  const rootProps = ('props' in root ? (root as { props?: AnyProps }).props : root) ?? {}
  const title = (rootProps.title as string) || ''
  const ctx: RenderCtx = { config: cfg, metadata, isEditing }

  const pageProps: AnyProps = {
    ...rootProps,
    puck: {
      renderDropZone: ({ zone }: { zone: string }) => (
        <DropZoneRender zone={zone} data={doc} ctx={ctx} />
      ),
      isEditing,
      dragRef: null,
      metadata,
    },
    title,
    // Puck's legacy root mirror of the same fact. Nothing in this repo reads it, but it
    // tracks `isEditing` rather than sitting frozen at false, so it can't become the next
    // stale flag a block trusts.
    editMode: isEditing,
    id: 'puck-root',
  }

  const resolvedRoot = propsWithSlots({ type: 'root', props: pageProps }, ctx)
  const rootRender = cfg.root?.render

  if (rootRender) {
    const Root = rootRender
    return (
      <Root {...resolvedRoot}>
        <DropZoneRender data={doc} zone={rootZone} ctx={ctx} />
      </Root>
    )
  }
  return <DropZoneRender data={doc} zone={rootZone} ctx={ctx} />
}

export default BlockRender
