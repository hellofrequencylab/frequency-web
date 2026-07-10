import { ENTITY_BLOCKS, entityBlockById, type EntityBlockDef } from './registry'
import { parseEmbedUrl, parseLinkCard } from '@/lib/spotlight/embeds'

// PER-BLOCK AUTHORED CONTENT + STYLE (ADR-528). The freeform grid (ADR-516/526) arranged blocks but their
// CONTENT was still authored in the Puck Home doc. This module gives every block an inline-editable content
// bag + a small style bag, both keyed by block id and stored on the opaque EntityLayout blob
// (profiles.meta.entityGrid / spaces.preferences.profileLayout) alongside `rows`. PURE + FAIL-SAFE (no
// React / Next / Supabase): every value is validated on read AND write, so a tampered blob can never inject
// a bad prop name (a block id key is allowlisted against the registry) or an unsafe URL.
//
// Two shapes:
//   • CONTENT blocks (heading/text/links/image/gallery/quote/embed/divider) — the operator authors their
//     content inline; each field is edited in the rail and rendered by our own ContentBlockView.
//   • DATA blocks (about/offerings/events/...) — bound to live data; they carry an EYEBROW + TITLE that
//     REPLACE the block's real rendered header (About/Story also carry a body), plus on/off (hidden).
// Every block also carries an optional STYLE bag: a card background on/off, a spacing step, and alignment.

// ── Style ────────────────────────────────────────────────────────────────────────────────────────────

/** A vertical MARGIN step (ADR-569 C2/C3): the space above / below a block or row. Token-driven (mapped
 *  to a spacing utility in the render frame), so it never hardcodes a pixel value. Absent === `md` (the
 *  sensible content-block default so a fresh page is not cramped — C2). `none` is an explicit "flush". */
export type MarginStep = 'none' | 'sm' | 'md' | 'lg' | 'xl'

/** A text SIZE step (ADR-569 C1): relative to the block's own type scale, not an absolute pixel. Absent ===
 *  the block's default size. */
export type TextSizeStep = 'sm' | 'md' | 'lg' | 'xl'
/** A font WEIGHT step (C1). Absent === the block's default weight. */
export type TextWeightStep = 'normal' | 'medium' | 'semibold' | 'bold'
/** A TOKEN color name (C1): the design tokens + the Space accent, never a raw hex (theming-safe). Absent ===
 *  the block's default text color. `accent` maps to the Space's primary accent so it re-skins with the theme. */
export type TextColorToken = 'default' | 'muted' | 'subtle' | 'accent' | 'success' | 'info' | 'danger'
/** A text SHADOW preset (C1): off (absent), a subtle lift, or a stronger pop. Token-driven. */
export type TextShadowStep = 'none' | 'soft' | 'strong'

/** The reusable TEXT-STYLE bag (ADR-569 C1): size / weight / align / token-color / shadow, each sparse
 *  (absent === the block's own default). Attached to text-bearing blocks; drives the shared text-style
 *  primitives in the editor and the render frame. Every field is a fixed enum, so a tampered blob can only
 *  ever pick a known token — no raw CSS reaches the page. */
export interface TextStyle {
  size?: TextSizeStep
  weight?: TextWeightStep
  color?: TextColorToken
  shadow?: TextShadowStep
}

/** The distinct TEXT ELEMENTS a rich block exposes for PER-ELEMENT styling (item 4: "unique to each text
 *  block — Eyebrow, Heading, Text"). A block with more than one of these (the design blocks, Callout,
 *  Features) gets one text-style bag PER role; a single-text block (Heading, Text, Quote) keeps the one
 *  whole-block `text` bag. The render targets each role in the block's DOM: `eyebrow` by a shared marker
 *  (`data-text-role`), `heading` by heading tags, `body` by paragraph tags — see textByRoleClass. */
export type TextRole = 'eyebrow' | 'heading' | 'body'
export const TEXT_ROLES: readonly TextRole[] = ['eyebrow', 'heading', 'body']

/** Per-block presentation: an optional card background, inner padding, alignment, vertical margins, and a
 *  reusable text-style bag. Every field is sparse — absent means the block's own default — so the stored
 *  blob stays minimal (ADR-528 → ADR-569). */
export interface BlockStyle {
  /** The box's white card (border + padded surface). Three states (ADR-542 item 6):
   *  - `true`   — force a card (a block that draws none, e.g. Text, gains one).
   *  - `false`  — force NO card: strip the card a self-carding block draws (the owner's "turn the white box off").
   *  - absent   — the block's own default (a self-carding block keeps its card; others stay flat). */
  background?: boolean
  /** Inner padding step. Absent === 'none'. */
  pad?: 'none' | 'sm' | 'md' | 'lg'
  /** Text / content alignment. Absent === 'start'. */
  align?: 'start' | 'center' | 'end'
  /** Top margin step (ADR-569 C3). Absent === the render default (C2). */
  mt?: MarginStep
  /** Bottom margin step (ADR-569 C3). Absent === the render default (C2). */
  mb?: MarginStep
  /** Reusable text-style bag (ADR-569 C1): size / weight / token-color / shadow. Absent === all defaults.
   *  Used by SINGLE-text blocks (Heading, Text, Quote) and the live DATA blocks — it styles ALL of the
   *  block's text at once. Multi-element blocks use `textByRole` instead (item 4). */
  text?: TextStyle
  /** PER-ELEMENT text-style bags (ADR-580, item 4): one TextStyle per text role the block exposes
   *  (eyebrow / heading / body), so an operator styles the Heading distinctly from the Body and the
   *  Eyebrow. Only the multi-element blocks (design blocks, Callout, Features) carry it; each role is
   *  sparse (absent === the block's own default). */
  textByRole?: Partial<Record<TextRole, TextStyle>>
}

const PAD_VALUES: ReadonlySet<string> = new Set(['none', 'sm', 'md', 'lg'])
const ALIGN_VALUES: ReadonlySet<string> = new Set(['start', 'center', 'end'])
const MARGIN_VALUES: ReadonlySet<string> = new Set(['none', 'sm', 'md', 'lg', 'xl'])
const TEXT_SIZE_VALUES: ReadonlySet<string> = new Set(['sm', 'md', 'lg', 'xl'])
const TEXT_WEIGHT_VALUES: ReadonlySet<string> = new Set(['normal', 'medium', 'semibold', 'bold'])
const TEXT_COLOR_VALUES: ReadonlySet<string> = new Set([
  'default',
  'muted',
  'subtle',
  'accent',
  'success',
  'info',
  'danger',
])
const TEXT_SHADOW_VALUES: ReadonlySet<string> = new Set(['none', 'soft', 'strong'])

/** Validate a text-style bag to the safe enum subset; drops any field that matches its default so the blob
 *  stays sparse. Returns undefined when nothing survives. Pure + total. */
export function sanitizeTextStyle(raw: unknown): TextStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: TextStyle = {}
  if (typeof o.size === 'string' && TEXT_SIZE_VALUES.has(o.size) && o.size !== 'md') out.size = o.size as TextSizeStep
  if (typeof o.weight === 'string' && TEXT_WEIGHT_VALUES.has(o.weight)) out.weight = o.weight as TextWeightStep
  if (typeof o.color === 'string' && TEXT_COLOR_VALUES.has(o.color) && o.color !== 'default')
    out.color = o.color as TextColorToken
  if (typeof o.shadow === 'string' && TEXT_SHADOW_VALUES.has(o.shadow) && o.shadow !== 'none')
    out.shadow = o.shadow as TextShadowStep
  return Object.keys(out).length ? out : undefined
}

/** Validate a style bag to the safe subset; returns undefined when nothing survives (keep the blob sparse). */
export function sanitizeBlockStyle(raw: unknown): BlockStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: BlockStyle = {}
  // Keep BOTH booleans: `true` forces a card, `false` forces none (item 6). Only `absent` = the default.
  if (o.background === true) out.background = true
  else if (o.background === false) out.background = false
  if (typeof o.pad === 'string' && PAD_VALUES.has(o.pad) && o.pad !== 'none') out.pad = o.pad as BlockStyle['pad']
  if (typeof o.align === 'string' && ALIGN_VALUES.has(o.align) && o.align !== 'start')
    out.align = o.align as BlockStyle['align']
  // Margins (ADR-569): a valid step is kept AS-IS, including an explicit `none` (a deliberate flush that
  // overrides the C2 render default). Only garbage is dropped.
  if (typeof o.mt === 'string' && MARGIN_VALUES.has(o.mt)) out.mt = o.mt as MarginStep
  if (typeof o.mb === 'string' && MARGIN_VALUES.has(o.mb)) out.mb = o.mb as MarginStep
  const text = sanitizeTextStyle(o.text)
  if (text) out.text = text
  // Per-element text bags (item 4): sanitize each known role's bag, drop empties, keep the map only when a
  // role survives. Iterating the fixed TEXT_ROLES allowlist means a tampered key can never be written.
  if (o.textByRole && typeof o.textByRole === 'object' && !Array.isArray(o.textByRole)) {
    const src = o.textByRole as Record<string, unknown>
    const byRole: Partial<Record<TextRole, TextStyle>> = {}
    for (const role of TEXT_ROLES) {
      const bag = sanitizeTextStyle(src[role])
      if (bag) byRole[role] = bag
    }
    if (Object.keys(byRole).length) out.textByRole = byRole
  }
  return Object.keys(out).length ? out : undefined
}

// ── Field schema (drives the editor + the sanitizer) ──────────────────────────────────────────────────

/** The kinds of field the inline editor can render, and the sanitizer enforces. Two families:
 *
 *  CONTENT field types — author the block's content bag (validated by sanitizeBlockContent):
 *    text · textarea · url · links · images · features · toggle (a boolean switch, e.g. "show this button").
 *
 *  PRIMITIVE control field types (ADR-569 C6) — a declarative catalog of the reusable INSPECTOR controls a
 *  feature agent attaches to a block. Each maps a value key onto a fixed enum, rendered by a shared control
 *  primitive (components/entity-blocks/controls). A feature is added by DECLARING one of these on a block,
 *  never by writing bespoke panel JSX:
 *    segmented       — a generic segmented pick over the field's `options`.
 *    align           — a Left | Center | Right alignment icon-group.
 *    height          — a 3-way Short | Medium | Tall selector.
 *    buttonOrientation — a Row | Stacked button-layout selector.
 *    color           — the token/accent swatch picker (theming-safe; no raw hex).
 *    shadow          — an on/off + preset shadow control.
 *    margin          — a compact top/bottom spacing control.
 *
 *  A `toggle` (and every primitive) is persisted only when it differs from its default, so the stored bag
 *  stays sparse. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'url'
  // A MEDIA-EMBED link: the operator pastes a normal share URL; it is kept ONLY when it resolves to a
  // known embed provider (YouTube / Spotify / SoundCloud / Vimeo) or a supported link-card host (Insight
  // Timer). The renderer re-derives a known-safe iframe src or a link card — never the raw URL (ADR-437).
  | 'embedUrl'
  | 'links'
  | 'images'
  | 'features'
  | 'toggle'
  // ADR-569 C6 primitives (attached to a block by a feature agent; validated against `options` / enum):
  | 'segmented'
  | 'align'
  | 'height'
  | 'buttonOrientation'
  | 'color'
  | 'shadow'
  | 'margin'
  // Function-aware DATA-SOURCE picker (ADR-573, item 5): a multi-select of the Space's own live items for a
  // function-backed block (which offerings / events / team members to feature). Its choices are NOT a fixed
  // enum baked into the schema — they are the Space's real data, resolved server-side (blockDataList) and
  // handed to the editor at runtime. The stored value is a `string[]` of the SELECTED item ids (a narrowing
  // + ordering of the block's items); an EMPTY / absent value means "show every item" (the function's live
  // default, item 7). A tampered id can only ever be a bounded string here; the render intersects it with
  // the block's live id set, so no unknown id reaches the page.
  | 'picker'

/** The value set a `height` field accepts (3-way selector, C6). */
export const HEIGHT_VALUES = ['short', 'medium', 'tall'] as const
/** The value set a `buttonOrientation` field accepts (C6). */
export const BUTTON_ORIENTATION_VALUES = ['row', 'stacked'] as const

/** One option in an enum-style primitive field (`segmented`). `label` is the accessible name; `icon` is an
 *  optional short token the control may render (voice-neutral). */
export interface FieldOption {
  value: string
  label: string
}

/** One editable field on a block's content bag, OR a declared primitive control (ADR-569 C6). A feature
 *  agent adds a control by pushing one of these onto the block's schema — the editor dispatches on `type`
 *  and the sanitizer validates the stored value against the same declaration, so declaring the field is the
 *  ONLY step. */
export interface FieldDef {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  /** Image field: the inline editor offers an UPLOAD control (ADR-542) beside the URL input, wired to the
   *  surface's gated upload action. Set on the image URL / image-list fields (callout image, gallery). */
  upload?: boolean
  /** Toggle field: the DEFAULT boolean (what "on" means). A `toggle` is persisted only when it differs from
   *  this default, so the stored bag stays sparse. The button toggles default ON. */
  default?: boolean
  /** A `segmented` field's choices (its allowlist). Ignored for the fixed-enum primitives (align / height /
   *  buttonOrientation / color / shadow / margin), which carry their own value set. */
  options?: readonly FieldOption[]
  /** The DEFAULT value for an enum primitive (segmented / align / height / …). The value is persisted only
   *  when it differs from this default (sparse blob). Absent === the primitive's own first / neutral value. */
  defaultValue?: string
  /** A `picker` field's data source (ADR-573, item 5): the block id whose live items feed the picker (its
   *  own id). The editor resolves the choices with `blockDataList(pickerBlock, spaceId)` and the empty-state
   *  create link with `blockCreateHref(pickerBlock, slug)`. Ignored for every non-picker field type. */
  pickerBlock?: string
}

/** The fixed value set a primitive `type` accepts, or null when the field is not a fixed-enum primitive
 *  (a `segmented` field carries its own `options`). Drives both the editor control and the sanitizer, so
 *  the two can never drift. Pure. */
export function primitiveValues(field: FieldDef): readonly string[] | null {
  switch (field.type) {
    case 'align':
      return ['start', 'center', 'end']
    case 'height':
      return HEIGHT_VALUES
    case 'buttonOrientation':
      return BUTTON_ORIENTATION_VALUES
    case 'color':
      return ['default', 'muted', 'subtle', 'accent', 'success', 'info', 'danger']
    case 'shadow':
      return ['none', 'soft', 'strong']
    case 'margin':
      return ['none', 'sm', 'md', 'lg', 'xl']
    case 'segmented':
      return field.options?.map((o) => o.value) ?? []
    default:
      return null
  }
}

/** The shared image SHAPE control (item 2: "set image aspect ratio Horizontal, Vertical, Square, Original").
 *  One declaration reused on EVERY block that places a single photo (Image, Callout, Zigzag), so the same
 *  four-way shape picker appears on all of them and the render maps the choice to a fixed ratio (or the
 *  photo's natural shape for `original`). Sanitizer + editor dispatch on the `segmented` type. */
const IMAGE_ASPECT_FIELD: FieldDef = {
  key: 'aspect',
  label: 'Shape',
  type: 'segmented',
  defaultValue: 'original',
  options: [
    { value: 'original', label: 'Original' },
    { value: 'horizontal', label: 'Horizontal' },
    { value: 'vertical', label: 'Vertical' },
    { value: 'square', label: 'Square' },
  ],
}

/** The CONTENT-block field schemas (the operator authors these). */
const CONTENT_FIELDS: Readonly<Record<string, readonly FieldDef[]>> = {
  // The SPACE free-form blocks (ADR-542).
  // Instructional placeholders (Fix 7): each slot's placeholder EXPLAINS what to write there, in the
  // Frequency voice, so an operator understands the block at a glance. Real content replaces them on type.
  callout: [
    { key: 'title', label: 'Title', type: 'text', placeholder: 'Your headline goes here' },
    { key: 'body', label: 'Message', type: 'textarea', placeholder: 'Tell your story in plain, honest sentences' },
    { key: 'buttonOn', label: 'Show button', type: 'toggle', default: true },
    { key: 'buttonLabel', label: 'Button label', type: 'text', placeholder: 'Button text' },
    { key: 'buttonUrl', label: 'Button link', type: 'url', placeholder: 'https:// (leave blank to set later)' },
    { key: 'image', label: 'Image', type: 'url', placeholder: 'https://', upload: true },
    IMAGE_ASPECT_FIELD,
  ],
  features: [{ key: 'items', label: 'Features', type: 'features' }],
  heading: [{ key: 'text', label: 'Heading', type: 'text', placeholder: 'Your heading goes here' }],
  text: [{ key: 'text', label: 'Text', type: 'textarea', placeholder: 'Tell your story in plain, honest sentences' }],
  links: [{ key: 'items', label: 'Links', type: 'links' }],
  image: [
    { key: 'src', label: 'Image', type: 'url', placeholder: 'https://', upload: true },
    { key: 'alt', label: 'Alt text', type: 'text', placeholder: 'Describe the image' },
    IMAGE_ASPECT_FIELD,
  ],
  // The image GALLERY: the photos plus a LAYOUT (three views) and a SPACING step. Both are declared enum
  // primitives, so the editor renders a segmented control and the sanitizer validates the stored value —
  // no bespoke JSX (ADR-569 C6). The render (content-block-view) reads both.
  gallery: [
    { key: 'images', label: 'Images', type: 'images', upload: true },
    {
      key: 'view',
      label: 'Layout',
      type: 'segmented',
      defaultValue: 'grid',
      options: [
        { value: 'grid', label: 'Grid' },
        { value: 'masonry', label: 'Masonry' },
        { value: 'carousel', label: 'Carousel' },
      ],
    },
    {
      key: 'gap',
      label: 'Spacing',
      type: 'segmented',
      defaultValue: 'standard',
      options: [
        { value: 'tight', label: 'Tight' },
        { value: 'standard', label: 'Standard' },
        { value: 'roomy', label: 'Roomy' },
      ],
    },
    // The Shape control also drives the GRID view's tile crop (item 2), so gallery photos are selectable too;
    // `original` keeps the uniform square grid, the others crop every tile to a fixed ratio. Masonry keeps
    // each photo's natural shape and the carousel is a fixed strip, so Shape only affects the grid.
    IMAGE_ASPECT_FIELD,
  ],
  quote: [
    { key: 'text', label: 'Quote', type: 'textarea', placeholder: 'The words you want to quote' },
    { key: 'by', label: 'Attribution', type: 'text', placeholder: 'Who said it' },
  ],
  embed: [
    { key: 'url', label: 'Media link', type: 'embedUrl', placeholder: 'Paste a YouTube, Spotify, SoundCloud, Vimeo, or Insight Timer link' },
  ],
  divider: [],
  // The five DESIGN blocks (2026), now editable in the rail arranger. The rail's field kit is text / textarea
  // / url / images / links / features, so each block exposes its CORE authored content through those types;
  // the richer Puck-only controls (variant, scrim, body mode, per-card repeaters) keep sensible defaults in
  // the render adapter (space-profile-modules.tsx) until the arranger grows those field types.
  // The Banner (stored id `photoHero`). ADR-571 adds a HEIGHT primitive (Short | Medium | Tall) and a
  // DISPLAY segmented (how the copy sits relative to the photo: over it, beside it, or below it). Both are
  // declared FieldDefs — the editor renders the shared primitive control and the sanitizer validates the
  // stored value against the same declaration, so no bespoke panel JSX is needed (ADR-569 C6). The render
  // adapter (design-block-view.tsx) reads both and passes them to the PhotoHeroBlock component.
  photoHero: [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the headline' },
    { key: 'title', label: 'Headline', type: 'textarea', placeholder: 'The big opener' },
    { key: 'subtitle', label: 'Subtitle', type: 'textarea', placeholder: 'A line under the headline' },
    { key: 'image', label: 'Background photo', type: 'url', placeholder: 'https://', upload: true },
    { key: 'alt', label: 'Photo description', type: 'text', placeholder: 'Describe the photo' },
    { key: 'height', label: 'Height', type: 'height', defaultValue: 'medium' },
    {
      key: 'display',
      label: 'Content',
      type: 'segmented',
      defaultValue: 'overlay',
      options: [
        { value: 'overlay', label: 'Over photo' },
        { value: 'beside', label: 'Beside photo' },
        { value: 'below', label: 'Below photo' },
      ],
    },
    { key: 'buttonOn', label: 'Show button', type: 'toggle', default: true },
    { key: 'buttonLabel', label: 'Button label', type: 'text', placeholder: 'Get started' },
    { key: 'buttonUrl', label: 'Button link', type: 'url', placeholder: 'https://' },
  ],
  editorial: [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the heading' },
    { key: 'title', label: 'Heading', type: 'textarea', placeholder: 'Section heading' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Write a paragraph or two' },
  ],
  cardGrid: [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the heading' },
    { key: 'title', label: 'Heading', type: 'textarea', placeholder: 'What you offer' },
    { key: 'cards', label: 'Cards', type: 'features' },
    { key: 'buttonOn', label: 'Show browse link', type: 'toggle', default: true },
    { key: 'browseLabel', label: 'Browse link label', type: 'text', placeholder: 'See everything' },
    { key: 'browseUrl', label: 'Browse link', type: 'url', placeholder: 'https://' },
  ],
  zigzag: [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the heading' },
    { key: 'title', label: 'Heading', type: 'textarea', placeholder: 'The story beat' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Tell this part of the story' },
    { key: 'image', label: 'Photo', type: 'url', placeholder: 'https://', upload: true },
    { key: 'alt', label: 'Photo description', type: 'text', placeholder: 'Describe the photo' },
    {
      key: 'mediaSide',
      label: 'Photo side',
      type: 'segmented',
      defaultValue: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
    },
    IMAGE_ASPECT_FIELD,
  ],
  accentBeat: [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the headline' },
    { key: 'title', label: 'Headline', type: 'textarea', placeholder: 'The call to action' },
    { key: 'body', label: 'Message', type: 'textarea', placeholder: 'Say a bit more' },
    { key: 'buttonOn', label: 'Show button', type: 'toggle', default: true },
    { key: 'buttonLabel', label: 'Button label', type: 'text', placeholder: 'Join now' },
    { key: 'buttonUrl', label: 'Button link', type: 'url', placeholder: 'https://' },
  ],
  // The two TEXT design blocks (ADR-571). Each carries a single authored string plus its font choice; the
  // rich size / weight / color / shadow live on the shared C1 text-style bag (blockBearsText → the editor's
  // Text style group), so the block schema stays a single content field. The `font` segmented lets the
  // operator pick the display face for the heading and the reading face for prose (both token-safe ids).
  displayHeading: [
    { key: 'text', label: 'Heading', type: 'textarea', placeholder: 'A big, bold title' },
    {
      key: 'font',
      label: 'Font',
      type: 'segmented',
      defaultValue: 'display',
      options: [
        { value: 'display', label: 'Display' },
        { value: 'serif', label: 'Serif' },
        { value: 'grotesk', label: 'Grotesk' },
      ],
    },
  ],
  prose: [
    { key: 'text', label: 'Paragraph', type: 'textarea', placeholder: 'Write a paragraph of body text' },
  ],
}

/** The header fields every DATA block carries (ADR-542): an EYEBROW (the small pre-text kicker) and a
 *  TITLE (the heading), which REPLACE what the block actually renders — its real eyebrow + heading —
 *  falling back to the block's default when left empty. This is the owner directive "edit the block's real
 *  eyebrow / title", not a second header stacked above it. */
const DATA_HEADER_FIELDS: readonly FieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', placeholder: 'Small text above the title' },
  { key: 'title', label: 'Title', type: 'text', placeholder: 'The section heading' },
]

/** Per-id DATA-block field schemas that go BEYOND the eyebrow/title (ADR-542). About + Story are the
 *  space's identity prose: the owner writes the actual body right here (a `body` textarea, persisted in the
 *  authored bag and rendered by the block, taking precedence over the space's stored about/story data), so
 *  the section is never empty for want of a place to type. The eyebrow/title still lead. */
const DATA_BLOCK_FIELDS: Readonly<Record<string, readonly FieldDef[]>> = {
  about: [
    ...DATA_HEADER_FIELDS,
    { key: 'body', label: 'About text', type: 'textarea', placeholder: 'A short intro to your space' },
  ],
  story: [
    ...DATA_HEADER_FIELDS,
    { key: 'body', label: 'Story text', type: 'textarea', placeholder: 'The longer story of your space' },
  ],
  // Function-backed blocks (ADR-573, item 5): the eyebrow / title header PLUS a data-source PICKER of the
  // Space's own live items, so the operator chooses WHICH offerings / events / team / journeys / circles the
  // section features. The picker's choices are the Space's real data (resolved server-side at edit time via
  // blockDataList); an empty pick shows every item (item 7). The `pickerBlock` names the block whose data
  // source feeds this picker (its own id here). When the Space has none of that function's items, the editor
  // shows a "Create ..." link instead (blockCreateHref).
  offerings: [...DATA_HEADER_FIELDS, { key: 'items', label: 'Offerings to feature', type: 'picker', pickerBlock: 'offerings' }],
  events: [...DATA_HEADER_FIELDS, { key: 'items', label: 'Events to feature', type: 'picker', pickerBlock: 'events' }],
  team: [...DATA_HEADER_FIELDS, { key: 'items', label: 'Team to feature', type: 'picker', pickerBlock: 'team' }],
  journeys: [...DATA_HEADER_FIELDS, { key: 'items', label: 'Journeys to feature', type: 'picker', pickerBlock: 'journeys' }],
  circles: [...DATA_HEADER_FIELDS, { key: 'items', label: 'Circles to feature', type: 'picker', pickerBlock: 'circles' }],
}

/** The block ids whose data-block schema carries a data-source picker (ADR-573, item 5). The seed getter
 *  reads each of these blocks' live items + create-href so the editor can render the picker. Derived from
 *  the schema above so the two never drift. */
export const PICKER_DATA_BLOCK_IDS: readonly string[] = Object.entries(DATA_BLOCK_FIELDS)
  .filter(([, fields]) => fields.some((f) => f.type === 'picker'))
  .map(([id]) => id)

/** A content block is one whose category is `content` in the registry. */
export function isContentBlock(block: EntityBlockDef): boolean {
  return block.category === 'content'
}

/** The content ids that draw their OWN white card (so the Background toggle DEFAULTS to on for them, and
 *  turning it off strips that card). Every DATA block also self-cards. The plain content blocks (Text,
 *  Heading, Links, Image, Gallery, Quote, Embed, Divider) draw no card, so their toggle defaults off and
 *  turning it ON adds a frame card. */
const SELF_CARDING_CONTENT_IDS: ReadonlySet<string> = new Set([
  'callout',
  'features',
  // The design blocks that draw their OWN filled background (a photo / an accent wash) default the Background
  // toggle ON, so turning it off strips that frame — true to what is on the page. The OPEN design blocks
  // (editorial / cardGrid / zigzag) render with no card by default, so they are deliberately ABSENT here: the
  // Background toggle defaults OFF and turning it ON wraps the block in a white card, so the control has a
  // real, visible effect on every block (the two flat TEXT design blocks displayHeading / prose match, and so
  // do Heading / Text).
  'photoHero',
  'accentBeat',
])

/** Whether a block renders its own white card by default (item 6). Drives the Background toggle's default
 *  state + write semantics so the control reads true to what is on the page. */
export function blockDrawsOwnCard(id: string): boolean {
  const block = entityBlockById(id)
  if (!block) return false
  return block.category === 'data' || SELF_CARDING_CONTENT_IDS.has(id)
}

/** The editable fields for a block id: the content schema for a content block, the quick fields for a data
 *  block, or [] for an unknown id. */
export function fieldsForBlock(id: string): readonly FieldDef[] {
  const block = entityBlockById(id)
  if (!block) return []
  if (isContentBlock(block)) return CONTENT_FIELDS[id] ?? []
  return DATA_BLOCK_FIELDS[id] ?? DATA_HEADER_FIELDS
}

/** The block ids that render NO stylable text, so the C1 text-style controls are hidden for them: a raw
 *  image, an image gallery, a horizontal rule, and an external embed. EVERY other block — the plain content
 *  blocks (Heading, Text, Quote, Callout, Features), the design blocks, AND the live DATA blocks (About,
 *  Story, Offerings, Contact, ...) — bears text worth styling, and the render frame now applies the text
 *  style to the block's descendant text, so the controls take effect there too. */
const NO_TEXT_BLOCK_IDS: ReadonlySet<string> = new Set(['image', 'gallery', 'divider', 'embed'])

/** Whether a block bears text and so exposes the C1 text-style controls (size / weight / align / color /
 *  shadow). True for every real block EXCEPT the purely-visual ones (image / gallery / divider / embed), so
 *  an operator can style the text on any content, design, or data block (Fix: "settings for any text"). */
export function blockBearsText(id: string): boolean {
  const block = entityBlockById(id)
  if (!block) return false
  return !NO_TEXT_BLOCK_IDS.has(id)
}

/** Whether a block supports the ALIGNMENT control (item 5 audit). Alignment sets text-align on the block
 *  wrapper, which only does anything for a block that carries inline TEXT; a full-width visual block (image,
 *  gallery, divider, embed) has nothing to align, so the editor hides the control there. Same set as
 *  blockBearsText, expressed as its own name so the editor reads by intent. */
export function blockSupportsAlign(id: string): boolean {
  return blockBearsText(id)
}

/** Whether a block supports the BACKGROUND (card) control (item 5 audit). Every real block can gain / strip a
 *  card EXCEPT the Divider, which is a hairline rule — a card around it is meaningless, so the editor hides
 *  the control for it. */
export function blockSupportsBackground(id: string): boolean {
  const block = entityBlockById(id)
  if (!block) return false
  return id !== 'divider'
}

/** The PER-ELEMENT text roles a block exposes (ADR-580, item 4). A block listed here has more than one
 *  distinct authored text element, so the editor gives it one text-style bag PER role (Eyebrow / Heading /
 *  Text) and the render targets each element separately (textByRoleClass). Every OTHER text-bearing block
 *  (the single-text content blocks Heading / Text / Quote, and the live DATA blocks whose body is data)
 *  returns [] and keeps the single whole-block `text` bag. Explicit (not derived) so the role set is exactly
 *  what each block actually renders — no drift from a field-key heuristic. */
const BLOCK_TEXT_ROLES: Readonly<Record<string, readonly TextRole[]>> = {
  // The design blocks carry an eyebrow, a heading, and body copy.
  photoHero: ['eyebrow', 'heading', 'body'],
  editorial: ['eyebrow', 'heading', 'body'],
  cardGrid: ['eyebrow', 'heading', 'body'],
  zigzag: ['eyebrow', 'heading', 'body'],
  accentBeat: ['eyebrow', 'heading', 'body'],
  // The two multi-element content blocks: a heading + body (no eyebrow).
  callout: ['heading', 'body'],
  features: ['heading', 'body'],
}

/** The ordered per-element text roles for a block id, or [] when the block styles its text as one whole
 *  (a single-text content block or a live data block). Drives the editor (per-role groups vs the single
 *  Text style group) and the render (textByRoleClass). Pure. */
export function blockTextRoles(id: string): readonly TextRole[] {
  return BLOCK_TEXT_ROLES[id] ?? []
}

/** The owner's authored header OVERRIDE for a DATA block: the `eyebrow` field maps to the block's real
 *  eyebrow, the `title` field to its real heading. Each is undefined when blank, so the block keeps its own
 *  default (the wrapper owns the fallback copy — one source, no drift). Pure; used by the render path so a
 *  data block draws the owner's real header instead of a separate one stacked above it (ADR-542). */
export function resolveDataHeader(
  id: string,
  props: Record<string, unknown> | undefined,
): { eyebrow?: string; heading?: string } {
  void id
  const eyebrow = typeof props?.eyebrow === 'string' && props.eyebrow.trim() ? props.eyebrow.trim() : undefined
  const heading = typeof props?.title === 'string' && props.title.trim() ? props.title.trim() : undefined
  return { eyebrow, heading }
}

/** The picker SELECTION for a block's authored bag (ADR-573, item 5): the operator's chosen item ids, as a
 *  clean `string[]`, or [] when none is stored. Pure; the render intersects these with the block's LIVE ids
 *  (resolvePickedIds) so a stale / removed item never renders. */
export function pickerSelection(props: Record<string, unknown> | undefined, key = 'items'): string[] {
  const v = props?.[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

/** Resolve the picker's stored selection against the block's LIVE item ids (ADR-573, items 5 + 7): keep the
 *  selected ids that still exist, in the operator's chosen ORDER; an empty / all-stale selection falls back
 *  to EVERY live id (the "show everything" default, item 7). Pure + fail-safe: a tampered / removed id is
 *  simply dropped, so the render only ever draws real items. */
export function resolvePickedIds(selected: readonly string[], liveIds: readonly string[]): string[] {
  const live = new Set(liveIds)
  const kept = selected.filter((id) => live.has(id))
  return kept.length ? kept : [...liveIds]
}

// ── URL safety ────────────────────────────────────────────────────────────────────────────────────────

/** Keep only a safe href: http(s), mailto, tel, or a same-origin relative path (`/` or `#`). Everything
 *  else (javascript:, data:, vbscript:, protocol-relative) becomes '' so it never reaches an href/src. */
export function safeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const v = raw.trim()
  if (!v) return ''
  if (v.startsWith('/') || v.startsWith('#')) return v
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v
  return ''
}

// ── Content sanitize ──────────────────────────────────────────────────────────────────────────────────

const MAX_TEXT = 2000
const MAX_ITEMS = 24
const MAX_LABEL = 120

function str(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.slice(0, max).trim() : ''
}

/** Sanitize one link row to `{ label, url }`, dropping it (null) when it has no safe url. */
function sanitizeLink(raw: unknown): { label: string; url: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = safeUrl(o.url)
  if (!url) return null
  return { label: str(o.label, MAX_LABEL) || url, url }
}

/** Sanitize one Features item to `{ icon, title, text }` (ADR-542), dropping it (null) when it carries no
 *  title and no text. `icon` is a short free-text token (a Lucide icon name or an emoji); it is bounded and
 *  never used as an object key. */
function sanitizeFeature(raw: unknown): { icon: string; title: string; text: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = str(o.title, MAX_LABEL)
  const text = str(o.text, MAX_TEXT)
  if (!title && !text) return null
  return { icon: str(o.icon, 40), title, text }
}

/**
 * Validate a block's authored content bag against its field schema (unknown keys dropped, values coerced +
 * bounded, urls made safe). Returns undefined when nothing usable survives, so the stored blob stays sparse.
 * PURE + total.
 */
export function sanitizeBlockContent(id: string, raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const field of fieldsForBlock(id)) {
    const v = o[field.key]
    switch (field.type) {
      case 'text':
        if (str(v, MAX_LABEL)) out[field.key] = str(v, MAX_LABEL)
        break
      case 'textarea':
        if (str(v, MAX_TEXT)) out[field.key] = str(v, MAX_TEXT)
        break
      case 'url': {
        const u = safeUrl(v)
        if (u) out[field.key] = u
        break
      }
      case 'embedUrl': {
        // A media-embed link: keep the raw share URL ONLY when it resolves to a known embed provider or a
        // supported link-card host. An arbitrary URL is dropped, so it can NEVER become an iframe src
        // (ADR-437) — the renderer re-derives a reconstructed, host-allowlisted src from this on read.
        if (typeof v === 'string' && (parseEmbedUrl(v) || parseLinkCard(v))) out[field.key] = v.trim().slice(0, 400)
        break
      }
      case 'toggle': {
        // Persist a boolean toggle ONLY when it differs from the field's default (keeps the blob sparse):
        // the button toggles default ON, so only an explicit `false` is stored. A non-boolean / matching
        // value is dropped, so the default stands on read.
        const def = field.default ?? false
        if (typeof v === 'boolean' && v !== def) out[field.key] = v
        break
      }
      case 'segmented':
      case 'align':
      case 'height':
      case 'buttonOrientation':
      case 'color':
      case 'shadow':
      case 'margin': {
        // An enum primitive (ADR-569 C6): keep the value only when it is one of the field's allowed values
        // AND differs from the declared default (sparse). The allowlist comes from the field declaration, so
        // a tampered blob can only ever store a known token — no raw value reaches the render.
        const allowed = primitiveValues(field)
        const def = field.defaultValue ?? allowed?.[0]
        if (typeof v === 'string' && allowed?.includes(v) && v !== def) out[field.key] = v
        break
      }
      case 'picker': {
        // A data-source picker (ADR-573, item 5): the SELECTED item ids as a bounded, de-duped string[].
        // The choices are the Space's live data (resolved at edit time), so the schema cannot pin an
        // allowlist here — each id is coerced to a bounded string and de-duped, and the RENDER intersects
        // the stored ids with the block's current live id set (so a stale / tampered id shows nothing).
        // An empty result is dropped so the block falls back to "show every item" (item 7).
        if (Array.isArray(v)) {
          const seen = new Set<string>()
          const ids: string[] = []
          for (const raw of v.slice(0, MAX_ITEMS)) {
            const id = str(raw, MAX_LABEL)
            if (id && !seen.has(id)) {
              seen.add(id)
              ids.push(id)
            }
          }
          if (ids.length) out[field.key] = ids
        }
        break
      }
      case 'links': {
        const items = Array.isArray(v)
          ? v.slice(0, MAX_ITEMS).map(sanitizeLink).filter((x): x is { label: string; url: string } => x !== null)
          : []
        if (items.length) out[field.key] = items
        break
      }
      case 'images': {
        const imgs = Array.isArray(v)
          ? v.slice(0, MAX_ITEMS).map(safeUrl).filter((u) => u.length > 0)
          : []
        if (imgs.length) out[field.key] = imgs
        break
      }
      case 'features': {
        const items = Array.isArray(v)
          ? v
              .slice(0, MAX_ITEMS)
              .map(sanitizeFeature)
              .filter((x): x is { icon: string; title: string; text: string } => x !== null)
          : []
        if (items.length) out[field.key] = items
        break
      }
    }
  }
  return Object.keys(out).length ? out : undefined
}

// ── Map sanitize (keyed by block id — the allowlist that blocks prototype pollution) ──────────────────

// The allowlist of every real block id, as a Set. Gating a user-originated key on `KNOWN_BLOCK_IDS.has`
// makes the written property name a fixed, safe value (mirrors lib/entity-blocks/layout.ts KNOWN_SLOT_IDS)
// — a bad key like `__proto__` is never a registry id, so it can never reach an object property (CodeQL
// js/remote-property-injection). A membership Set is the pattern the analysis recognises as a sanitizer.
const KNOWN_BLOCK_IDS: ReadonlySet<string> = new Set(ENTITY_BLOCKS.map((b) => b.id))

/** Validate the whole per-block content map. Iterates the ALLOWLIST (not the raw object), so every written
 *  key is a fixed registry id — a user key can only be READ, never used as a write property name (no
 *  remote property injection). Each value is sanitized to its schema. Returns undefined when empty. */
export function sanitizeContentMap(raw: unknown): Record<string, Record<string, unknown>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const src = raw as Record<string, unknown>
  const out: Record<string, Record<string, unknown>> = {}
  for (const id of KNOWN_BLOCK_IDS) {
    if (!Object.hasOwn(src, id)) continue
    const clean = sanitizeBlockContent(id, src[id])
    if (clean) out[id] = clean
  }
  return Object.keys(out).length ? out : undefined
}

/** Validate the whole per-block style map. Iterates the ALLOWLIST (see sanitizeContentMap), so a user key
 *  is only ever read. Returns undefined when empty. */
export function sanitizeStyleMap(raw: unknown): Record<string, BlockStyle> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const src = raw as Record<string, unknown>
  const out: Record<string, BlockStyle> = {}
  for (const id of KNOWN_BLOCK_IDS) {
    if (!Object.hasOwn(src, id)) continue
    const clean = sanitizeBlockStyle(src[id])
    if (clean) out[id] = clean
  }
  return Object.keys(out).length ? out : undefined
}

// ── Style → utility-class mapping (ADR-569) ─────────────────────────────────────────────────────────────
// The ONE place a style token becomes a Tailwind utility. The render frame (BlockStyleFrame) and the editor
// controls both read these, so the class a swatch previews is always the class the page renders — no drift,
// no hardcoded hex (every class resolves to a DAWN semantic token / spacing scale). Each map is keyed on a
// FIXED enum value the sanitizer already guaranteed, so the literal strings are safe to concatenate.

/** The DEFAULT top/bottom margin a block-frame applies when the operator has not set one (ADR-569 C2/C3).
 *  It is `none` because the base inter-block RHYTHM is owned by the grid stack (entity-grid's `space-y-*`,
 *  bumped to a comfortable step for C2 so a fresh page is not cramped). Keeping the frame default `none`
 *  avoids DOUBLE-counting that rhythm; the C3 control then adds explicit extra space above / below a block
 *  only where the operator asks for it. `mt-0` / `mb-0` are still emitted so an explicit `none` genuinely
 *  flushes a block against its neighbour, overriding the stack gap. */
export const DEFAULT_BLOCK_MARGIN: MarginStep = 'none'

/** A margin step → top-margin utility. Absent leaves the stack rhythm untouched (no class); a set step ADDS
 *  space above (an explicit `none` emits `mt-0` to flush). */
const MARGIN_TOP_CLASS: Record<MarginStep, string> = {
  none: 'mt-0',
  sm: 'mt-4',
  md: 'mt-8',
  lg: 'mt-12',
  xl: 'mt-20',
}
const MARGIN_BOTTOM_CLASS: Record<MarginStep, string> = {
  none: 'mb-0',
  sm: 'mb-4',
  md: 'mb-8',
  lg: 'mb-12',
  xl: 'mb-20',
}

/** The top-margin utility for a block: the set step, or '' when absent (leave the stack rhythm alone). */
export function marginTopClass(step: MarginStep | undefined): string {
  return step ? MARGIN_TOP_CLASS[step] : ''
}
/** The bottom-margin utility for a block: the set step, or '' when absent (leave the stack rhythm alone). */
export function marginBottomClass(step: MarginStep | undefined): string {
  return step ? MARGIN_BOTTOM_CLASS[step] : ''
}

// The text-style bag is applied on a WRAPPER around the block. A block's own renderers hardcode their text
// utilities (e.g. `text-base text-muted`) directly on the <p>/<h2>, and an element's own class beats an
// inherited value — so a bare `text-lg` on the wrapper would silently no-op (the Size / Color bug). To make
// Size and Color actually take effect, size + color + weight target the wrapper's descendant TEXT elements
// with an `!important` child variant (`[&_:where(<tags>)]:!<util>`), so the operator's chosen value
// overrides the block's hardcoded one. The `:where()` keeps specificity flat; `!` is what wins. Shadow
// inherits cleanly (children never set it), so it stays a plain wrapper class.
//
// IMPORTANT (build): each value is written as a FULL, LITERAL class string — NOT interpolated from a shared
// tag const — because Tailwind's scanner reads source TEXT and cannot evaluate a template `${...}`, so an
// interpolated variant would never be generated in the CSS. The tag list (kept identical across every
// literal) is: h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em. Scoped to text tags,
// so icons / buttons / media are untouched.
const TEXT_SIZE_CLASS: Record<TextSizeStep, string> = {
  sm: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-sm',
  md: '',
  lg: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-lg',
  xl: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-xl',
}
const TEXT_WEIGHT_CLASS: Record<TextWeightStep, string> = {
  normal: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!font-normal',
  medium: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!font-medium',
  semibold: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!font-semibold',
  bold: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!font-bold',
}
/** Token color → a text-color utility. Every value resolves to a DAWN semantic token (never a raw hex), so
 *  `accent` re-skins with the Space theme and the whole set stays theming-safe (C1). Applied to descendant
 *  text elements with `!important` so it overrides a block's own hardcoded color. Full literals (see note). */
const TEXT_COLOR_CLASS: Record<TextColorToken, string> = {
  default: '',
  muted: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-muted',
  subtle: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-subtle',
  accent: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-primary-strong',
  success: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-success',
  info: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-info',
  danger: '[&_:where(h1,h2,h3,h4,h5,h6,p,span,li,blockquote,figcaption,dt,dd,a,strong,em)]:!text-danger',
}
/** Shadow preset → a text-shadow utility (defined in globals; see `.text-shadow-soft` / `-strong`). Text
 *  shadow inherits cleanly (children never set their own), so this stays a plain wrapper class. */
const TEXT_SHADOW_CLASS: Record<TextShadowStep, string> = {
  none: '',
  soft: 'text-shadow-soft',
  strong: 'text-shadow-strong',
}

/** The utility classes for a text-style bag (ADR-569 C1), or '' when the bag is empty / all-default. Pure;
 *  the render frame applies the result to a wrapper. Size / weight / color target the wrapper's descendant
 *  text elements with an `!important` variant so the operator's choice overrides the block's own hardcoded
 *  utilities (otherwise Size / Color silently no-op); shadow inherits. A tampered value never reaches here
 *  (sanitizeTextStyle already gated it to the enum). */
export function textStyleClass(text: TextStyle | undefined): string {
  if (!text) return ''
  return [
    text.size ? TEXT_SIZE_CLASS[text.size] : '',
    text.weight ? TEXT_WEIGHT_CLASS[text.weight] : '',
    text.color ? TEXT_COLOR_CLASS[text.color] : '',
    text.shadow ? TEXT_SHADOW_CLASS[text.shadow] : '',
  ]
    .filter(Boolean)
    .join(' ')
}

// ── Per-element text style → role-scoped utility classes (ADR-580, item 4) ────────────────────────────────
// One text-style bag per ROLE targets only that element inside the block wrapper, so the Heading can be big
// and bold while the Body stays plain. The role is selected in the DOM three ways, all as FULL LITERAL class
// strings (the whole-block note applies: Tailwind scans source TEXT and cannot evaluate an interpolated
// `${role}`, so every literal is written out and kept in lockstep):
//   • eyebrow — the shared Eyebrow atom carries `data-text-role="eyebrow"`, matched by an attribute selector.
//   • heading — every heading tag (h1..h6); headings are reliably h-tags across every renderer.
//   • body    — paragraph tags (p / li / blockquote / figcaption / dd / dt), EXCLUDING the eyebrow (which is
//               itself a <p>) so the two never fight. Size / weight / color win with `!important`; shadow
//               inherits, so it needs no `!`.
const ROLE_SIZE_CLASS: Record<TextRole, Partial<Record<TextSizeStep, string>>> = {
  eyebrow: {
    sm: '[&_[data-text-role=eyebrow]]:!text-sm',
    lg: '[&_[data-text-role=eyebrow]]:!text-lg',
    xl: '[&_[data-text-role=eyebrow]]:!text-xl',
  },
  heading: {
    sm: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-sm',
    lg: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-lg',
    xl: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-xl',
  },
  body: {
    sm: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-sm',
    lg: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-lg',
    xl: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-xl',
  },
}
const ROLE_WEIGHT_CLASS: Record<TextRole, Record<TextWeightStep, string>> = {
  eyebrow: {
    normal: '[&_[data-text-role=eyebrow]]:!font-normal',
    medium: '[&_[data-text-role=eyebrow]]:!font-medium',
    semibold: '[&_[data-text-role=eyebrow]]:!font-semibold',
    bold: '[&_[data-text-role=eyebrow]]:!font-bold',
  },
  heading: {
    normal: '[&_:where(h1,h2,h3,h4,h5,h6)]:!font-normal',
    medium: '[&_:where(h1,h2,h3,h4,h5,h6)]:!font-medium',
    semibold: '[&_:where(h1,h2,h3,h4,h5,h6)]:!font-semibold',
    bold: '[&_:where(h1,h2,h3,h4,h5,h6)]:!font-bold',
  },
  body: {
    normal: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!font-normal',
    medium: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!font-medium',
    semibold: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!font-semibold',
    bold: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!font-bold',
  },
}
const ROLE_COLOR_CLASS: Record<TextRole, Partial<Record<TextColorToken, string>>> = {
  eyebrow: {
    muted: '[&_[data-text-role=eyebrow]]:!text-muted',
    subtle: '[&_[data-text-role=eyebrow]]:!text-subtle',
    accent: '[&_[data-text-role=eyebrow]]:!text-primary-strong',
    success: '[&_[data-text-role=eyebrow]]:!text-success',
    info: '[&_[data-text-role=eyebrow]]:!text-info',
    danger: '[&_[data-text-role=eyebrow]]:!text-danger',
  },
  heading: {
    muted: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-muted',
    subtle: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-subtle',
    accent: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-primary-strong',
    success: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-success',
    info: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-info',
    danger: '[&_:where(h1,h2,h3,h4,h5,h6)]:!text-danger',
  },
  body: {
    muted: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-muted',
    subtle: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-subtle',
    accent: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-primary-strong',
    success: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-success',
    info: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-info',
    danger: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:!text-danger',
  },
}
const ROLE_SHADOW_CLASS: Record<TextRole, Partial<Record<TextShadowStep, string>>> = {
  eyebrow: {
    soft: '[&_[data-text-role=eyebrow]]:text-shadow-soft',
    strong: '[&_[data-text-role=eyebrow]]:text-shadow-strong',
  },
  heading: {
    soft: '[&_:where(h1,h2,h3,h4,h5,h6)]:text-shadow-soft',
    strong: '[&_:where(h1,h2,h3,h4,h5,h6)]:text-shadow-strong',
  },
  body: {
    soft: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:text-shadow-soft',
    strong: '[&_:where(p,li,blockquote,figcaption,dd,dt):not([data-text-role=eyebrow])]:text-shadow-strong',
  },
}

/** The role-scoped utility classes for one role's text-style bag, or '' when it is empty / all-default. */
function roleTextClass(role: TextRole, text: TextStyle | undefined): string {
  if (!text) return ''
  return [
    text.size ? ROLE_SIZE_CLASS[role][text.size] ?? '' : '',
    text.weight ? ROLE_WEIGHT_CLASS[role][text.weight] : '',
    text.color ? ROLE_COLOR_CLASS[role][text.color] ?? '' : '',
    text.shadow ? ROLE_SHADOW_CLASS[role][text.shadow] ?? '' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** The utility classes for a per-element text map (ADR-580, item 4), or '' when empty. Each role targets
 *  only its own element inside the block wrapper, so the Heading, Body, and Eyebrow style independently.
 *  Pure; the render frame (BlockStyleFrame) applies the result to the same wrapper as textStyleClass. */
export function textByRoleClass(byRole: Partial<Record<TextRole, TextStyle>> | undefined): string {
  if (!byRole) return ''
  return TEXT_ROLES.map((role) => roleTextClass(role, byRole[role]))
    .filter(Boolean)
    .join(' ')
}

/** A single swatch's PREVIEW class for the editor's color control: the background chip that shows a token.
 *  Reuses the SAME token names as the render map, so the picker chip and the rendered text agree. */
export function colorSwatchClass(token: TextColorToken): string {
  switch (token) {
    case 'default':
      return 'bg-text'
    case 'muted':
      return 'bg-muted'
    case 'subtle':
      return 'bg-subtle'
    case 'accent':
      return 'bg-primary'
    case 'success':
      return 'bg-success'
    case 'info':
      return 'bg-info'
    case 'danger':
      return 'bg-danger'
  }
}
