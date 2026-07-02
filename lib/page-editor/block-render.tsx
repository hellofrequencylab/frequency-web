import { Fragment, type CSSProperties, type ReactNode } from 'react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'

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

function makeSlot(content: Item[], config: RenderableConfig, metadata: Metadata): SlotComponent {
  const Slot: SlotComponent = (dzProps) => (
    <SlotRender {...dzProps} content={content} config={config} metadata={metadata} />
  )
  return Slot
}

// walkField / walkObject — a faithful port of Puck's map-fields walk restricted
// to the slot mapper (the only transform the render path applies).
function walkField(
  value: unknown,
  fields: Fields,
  propKey: string,
  propPath: string,
  config: RenderableConfig,
  metadata: Metadata,
): unknown {
  const fieldType = fields[propKey]?.type
  if (fieldType === 'slot') {
    const content = (value ?? []) as Item[]
    return makeSlot(content, config, metadata)
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      const arrayFields = fields[propKey]?.type === 'array' ? fields[propKey]?.arrayFields : undefined
      if (!arrayFields) return value
      return value.map((el, idx) =>
        walkField(el, arrayFields, propKey, `${propPath}[${idx}]`, config, metadata),
      )
    }
    if ('$$typeof' in (value as object)) return value // React element — leave intact
    const objectFields = fields[propKey]?.type === 'object' ? (fields[propKey]?.objectFields ?? {}) : fields
    return walkObject(value as AnyProps, objectFields, (k) => `${propPath}.${k}`, config, metadata)
  }
  return value
}

function walkObject(
  value: AnyProps,
  fields: Fields,
  getPropPath: (k: string) => string,
  config: RenderableConfig,
  metadata: Metadata,
): AnyProps {
  const out: AnyProps = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = walkField(v, fields, k, getPropPath(k), config, metadata)
  }
  return out
}

// Resolve a single item's props with its slot fields swapped for Slot components.
// Mirrors useSlots' mergedProps = { ...item.props, ...mapFields(item).props }.
function propsWithSlots(
  item: { type?: string; props?: AnyProps },
  config: RenderableConfig,
  metadata: Metadata,
): AnyProps {
  const itemType = item.type ?? 'root'
  const componentConfig = itemType === 'root' ? config.root : config.components[itemType]
  const fields = componentConfig?.fields ?? {}
  const props = item.props ?? {}
  const transformed = walkObject(defaultSlots(props, fields), fields, (k) => k, config, metadata)
  return { ...props, ...transformed }
}

// ── Slot rendering (mirrors components/SlotRender/server.tsx) ──

function SlotRender({
  className,
  style,
  content,
  config,
  metadata,
}: {
  className?: string
  style?: CSSProperties
  content: Item[]
  config: RenderableConfig
  metadata: Metadata
}) {
  return (
    <div className={className} style={style}>
      {content.map((item) => {
        if (!config.components[item.type]) return null
        return <SlotItem key={item.props.id as string} config={config} item={item} metadata={metadata} />
      })}
    </div>
  )
}

// One nested slot child: re-run the slot transform for its own props, then render
// it with puck: { ...props.puck, metadata } (nested items carry metadata only —
// no renderDropZone — exactly as Puck's SlotRender/Item does).
function SlotItem({
  config,
  item,
  metadata,
}: {
  config: RenderableConfig
  item: Item
  metadata: Metadata
}) {
  const component = config.components[item.type]!
  const props = propsWithSlots(item, config, metadata)
  const Component = component.render
  return <Component {...props} puck={{ ...(props.puck as AnyProps | undefined), metadata: metadata || {} }} />
}

// ── Content zone (mirrors components/ServerRender DropZoneRender) ──

function DropZoneRender({
  zone,
  data,
  areaId = rootAreaId,
  config,
  metadata = {},
}: {
  zone: string
  data: RenderableData
  areaId?: string
  config: RenderableConfig
  metadata?: Metadata
}) {
  if (!data || !config) return null
  let content: Item[] = data.content ?? []
  // Legacy pre-slot `zones` map: only consulted for a non-root area/zone.
  if (areaId !== rootAreaId && zone !== rootZone) {
    const zoneCompound = `${areaId}:${zone}`
    content = (data.zones?.[zoneCompound] ?? []) as Item[]
  }
  return (
    <Fragment>
      {content.map((item) => {
        const component = config.components[item.type]
        const baseProps: AnyProps = {
          ...item.props,
          puck: {
            renderDropZone: ({ zone: z }: { zone: string }) => (
              <DropZoneRender
                zone={z}
                data={data}
                areaId={item.props.id as string}
                config={config}
                metadata={metadata}
              />
            ),
            metadata,
            dragRef: null,
            isEditing: false,
          },
        }
        if (!component) return null
        const resolved = propsWithSlots({ type: item.type, props: baseProps }, config, metadata)
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
}: {
  config: Config
  data: Data
  metadata?: Metadata
}) {
  const cfg = config as unknown as RenderableConfig
  const doc = (data ?? {}) as RenderableData
  const root = (doc.root ?? {}) as AnyProps
  const rootProps = ('props' in root ? (root as { props?: AnyProps }).props : root) ?? {}
  const title = (rootProps.title as string) || ''

  const pageProps: AnyProps = {
    ...rootProps,
    puck: {
      renderDropZone: ({ zone }: { zone: string }) => (
        <DropZoneRender zone={zone} data={doc} config={cfg} metadata={metadata} />
      ),
      isEditing: false,
      dragRef: null,
      metadata,
    },
    title,
    editMode: false,
    id: 'puck-root',
  }

  const resolvedRoot = propsWithSlots({ type: 'root', props: pageProps }, cfg, metadata)
  const rootRender = cfg.root?.render

  if (rootRender) {
    const Root = rootRender
    return (
      <Root {...resolvedRoot}>
        <DropZoneRender config={cfg} data={doc} zone={rootZone} metadata={metadata} />
      </Root>
    )
  }
  return <DropZoneRender config={cfg} data={doc} zone={rootZone} metadata={metadata} />
}

export default BlockRender
