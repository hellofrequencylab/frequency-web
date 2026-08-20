'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Palette, ImagePlus, X, RotateCcw, TriangleAlert } from 'lucide-react'
import { LoomPicker } from '@/components/loom/loom-picker'
import {
  type QrStyle,
  type ModuleShape,
  type EyeShape,
  STYLE_PRESETS,
  DEFAULT_STYLE,
  isSafeLogoSrc,
} from '@/lib/qr/style'
import { scannabilityWarnings } from '@/lib/qr/scannability'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_QR_STUDIO_CONFIG, type QrStudioConfig } from '@/lib/elements/qr-studio-config'

// The "make them beautiful" editor: live-previewed controls over a QrStyle.
// Renders the exact same SVG the server/Studio/download produce, so what the
// operator designs is what prints.
//
// Two layouts:
//   • inline (default) — a compact bordered card used inside an item's edit form.
//   • rail            — a hero preview on top + presets + stacked controls, used
//                       as the left rail of the Studio generator (editor up top).
//
// ELEMENT CONFIG (LIVE-066): the qr-studio element's per-viewer config (resolveQrStudio, mirroring the
// header element's resolveHeaderElement precedent) decides which control groups render. The server
// mount resolves it and passes it down; a control the viewer's config turns off is NOT rendered — the
// same way a header consumer simply omits the links cluster when its config says links off. Omitting
// the prop keeps the resolver's fail-safe: the full config.
export function StyleEditor({
  value,
  onChange,
  previewUrl,
  variant = 'inline',
  compact = false,
  config = DEFAULT_QR_STUDIO_CONFIG,
  presetsFooter,
  renderCompact,
}: {
  value: QrStyle
  onChange: (next: QrStyle) => void
  previewUrl: string
  /** inline — bordered card (preview + presets + controls); rail — hero preview on
   *  top; controls — JUST the design controls (no preview/presets), for when the
   *  caller renders its own preview + presets alongside. */
  variant?: 'inline' | 'rail' | 'controls'
  /** Trim to the essentials (drops eye-color + gradient controls, shows the four
   *  core presets) — used in the page Settings panel where space is tight. */
  compact?: boolean
  /** The viewer's resolved qr-studio element config (resolveQrStudio): which design control groups this
   *  viewer may use. Defaults to the full config (the resolver's fail-safe). */
  config?: QrStudioConfig
  /** Slot rendered directly under the preset buttons (e.g. an "Archived codes" link). */
  presetsFooter?: ReactNode
  /** Compact-only: the caller lays out the design pieces itself. The editor hands back
   *  the live preview, the design controls, and the preset buttons as three nodes to
   *  arrange — e.g. preview + presets in a left column, controls in a wide right column,
   *  for a horizontal designer. */
  renderCompact?: (parts: { preview: ReactNode; controls: ReactNode; presets: ReactNode }) => ReactNode
}) {
  const [logoLoomOpen, setLogoLoomOpen] = useState(false)
  const svg = useMemo(() => renderStyledQrSvg(previewUrl, value, 240), [previewUrl, value])
  const warnings = useMemo(() => scannabilityWarnings(value), [value])

  function set<K extends keyof QrStyle>(key: K, v: QrStyle[K]) {
    onChange({ ...value, [key]: v })
  }

  // Compact mode and the element config's 'core' preset choice both show the four core looks; the
  // full set (incl. Forest / Gold) is kept in the data for member-code defaults and the Studio.
  const visiblePresets = compact || config.presets === 'core'
    ? STYLE_PRESETS.filter((p) => !['forest', 'gold'].includes(p.key))
    : STYLE_PRESETS
  const presets = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visiblePresets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange({ ...p.style })}
            className="rounded-pill border border-border px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-primary hover:bg-primary-bg hover:text-primary-strong"
          >
            {p.label}
          </button>
        ))}
      </div>
      {presetsFooter}
    </div>
  )

  // Live scannability advisory — surfaced in both layouts so a low-contrast or
  // logo-heavy design is flagged before it's printed.
  const warningsBox = warnings.length > 0 && (
    <div className="mt-2 rounded-lg border border-warning/40 bg-warning-bg/50 p-2">
      <p className="flex items-center gap-1 text-2xs font-semibold text-warning">
        <TriangleAlert className="h-3 w-3" /> Scannability
      </p>
      <ul className="mt-1 space-y-1 text-2xs text-muted">
        {warnings.map((w, i) => (
          <li key={i}>• {w}</li>
        ))}
      </ul>
    </div>
  )

  // Which control groups THIS viewer gets (the element config): a group the config turns off is not
  // rendered at all, mirroring how the header element's consumers omit the links cluster when their
  // resolved config says links off.
  const showEyeColor = !compact && config.eyeColor
  const showGradient = !compact && config.gradient
  const showColorsGroup = config.colors || showEyeColor || showGradient

  const controls = (
    <div className="space-y-4 text-meta">
      {/* ── Colors ─────────────────────────────────────────────────────────── */}
      {showColorsGroup && (
      <Group label="Colors">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {config.colors && (
            <>
              <Swatch label="Modules" value={value.fg} onChange={(c) => set('fg', c)} />
              <Swatch label="Background" value={value.bg} onChange={(c) => set('bg', c)} />
            </>
          )}
          {/* A <div>, not a <label>: two controls (the toggle and the colour well) cannot share
              one label, and the well used to sit inside the checkbox's label naming neither. */}
          {showEyeColor && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                label={<span className="text-subtle">Eye color</span>}
                checked={!!value.eyeColor}
                onChange={(e) => set('eyeColor', e.target.checked ? value.fg : null)}
              />
              {value.eyeColor && (
                <input
                  type="color"
                  aria-label="Eye colour"
                  value={value.eyeColor}
                  onChange={(e) => set('eyeColor', e.target.value)}
                  className="h-5 w-6 rounded-control border border-border bg-transparent p-0"
                />
              )}
            </div>
          )}
        </div>

        {showGradient && (
          <div>
            <Checkbox
              label={<span className="text-subtle">Gradient fill</span>}
              checked={!!value.gradient}
              onChange={(e) =>
                set('gradient', e.target.checked ? { from: value.fg, to: '#db2777', angle: 45 } : null)
              }
            />
            {value.gradient && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-5">
                <Swatch
                  label="From"
                  value={value.gradient.from}
                  onChange={(c) => set('gradient', { ...value.gradient!, from: c })}
                />
                <Swatch
                  label="To"
                  value={value.gradient.to}
                  onChange={(c) => set('gradient', { ...value.gradient!, to: c })}
                />
                <label className="flex items-center gap-1.5">
                  <span className="text-subtle">Angle</span>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={value.gradient.angle}
                    onChange={(e) => set('gradient', { ...value.gradient!, angle: Number(e.target.value) })}
                    className="accent-primary"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </Group>
      )}

      {/* ── Shape ──────────────────────────────────────────────────────────── */}
      {config.shapes && (
      <Group label="Shape">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <StyleSelect
            label="Modules"
            value={value.moduleShape}
            options={[
              ['square', 'Square'],
              ['rounded', 'Rounded'],
              ['dots', 'Dots'],
              ['connected', 'Connected'],
            ]}
            onChange={(v) => set('moduleShape', v as ModuleShape)}
          />
          <StyleSelect
            label="Eyes"
            value={value.eyeShape}
            options={[
              ['square', 'Square'],
              ['rounded', 'Rounded'],
              ['circle', 'Circle'],
            ]}
            onChange={(v) => set('eyeShape', v as EyeShape)}
          />
          <StyleSelect
            label="Pupils"
            value={value.pupilShape}
            options={[
              ['square', 'Square'],
              ['rounded', 'Rounded'],
              ['circle', 'Circle'],
            ]}
            onChange={(v) => set('pupilShape', v as EyeShape)}
          />
        </div>
      </Group>
      )}

      {/* ── Logo ───────────────────────────────────────────────────────────── */}
      {config.logo && (
      <Group label="Logo">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLogoLoomOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <ImagePlus className="w-3 h-3" /> Choose
          </button>
          <LoomPicker
            open={logoLoomOpen}
            onClose={() => setLogoLoomOpen(false)}
            onSelect={(url) => { if (isSafeLogoSrc(url)) set('logo', url) }}
            title="Choose a logo"
          />
          {value.logo && (
            <button
              type="button"
              onClick={() => set('logo', null)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted hover:text-danger transition-colors"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          )}
        </div>

        {value.logo && (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <StyleSelect
              label="Crop"
              value={value.logoShape}
              options={[
                ['square', 'Square'],
                ['circle', 'Circle'],
              ]}
              onChange={(v) => set('logoShape', v as QrStyle['logoShape'])}
            />
            <StyleSelect
              label="Color"
              value={value.logoTint}
              options={[
                ['none', 'Original'],
                ['solid', 'Module color'],
                ['gradient', 'Gradient'],
              ]}
              onChange={(v) => set('logoTint', v as QrStyle['logoTint'])}
            />
          </div>
        )}
      </Group>
      )}

      {/* ── Frame ──────────────────────────────────────────────────────────── */}
      {config.frame && (
      <Group label="Frame">
        <label className="block">
          <span className="mb-1 block text-subtle">Card label (optional, adds a “scan me” frame)</span>
          <Input
            value={value.frameLabel ?? ''}
            onChange={(e) => set('frameLabel', e.target.value || null)}
            placeholder="e.g. Scan me"
            maxLength={28}
          />
        </label>
      </Group>
      )}

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_STYLE })}
        className="inline-flex items-center gap-1 text-subtle transition-colors hover:text-text"
      >
        <RotateCcw className="h-3 w-3" /> Reset design
      </button>
    </div>
  )

  // ── Controls-only — design controls with no preview/presets (the caller renders
  //    its own, e.g. the Studio generator's left column). ───────────────────────
  if (variant === 'controls') {
    return (
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-primary-strong" />
          <h4 className="text-2xs font-semibold uppercase tracking-wider text-text">Design</h4>
        </div>
        {controls}
        {warningsBox}
      </div>
    )
  }

  // ── Rail layout — hero preview on top, presets, then stacked controls ────────
  if (variant === 'rail') {
    return (
      <div className="space-y-4">
        <div
          // // KEEP bg-white: a QR reader needs a true-white quiet zone behind the modules, so this fill is a scanner requirement rather than a themed surface.
          className="mx-auto aspect-square w-full max-w-[220px] rounded-card border border-border bg-white p-2 lift-1 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Presets</p>
          {presets}
          {warningsBox}
        </div>
        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-primary-strong" />
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-text">Design</h4>
          </div>
          {controls}
        </div>
      </div>
    )
  }

  // ── Compact layout — the caller arranges the three pieces (preview · controls ·
  //    presets) for a horizontal designer (page-qr-manager puts preview + presets in a
  //    left column and the controls in a wide right column). We just supply the nodes. ──
  if (compact && renderCompact) {
    return (
      <div className="rounded-card border border-border bg-canvas/50 p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Palette className="w-4 h-4 text-primary-strong" />
          <h4 className="text-meta font-semibold uppercase tracking-wider text-text">Design</h4>
        </div>

        {renderCompact({
          preview: (
            <div
              // // KEEP bg-white: a QR reader needs a true-white quiet zone behind the modules, so this fill is a scanner requirement rather than a themed surface.
              className="aspect-square w-40 rounded-lg border border-border bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ),
          controls,
          presets: (
            <>
              {presets}
              {warningsBox}
            </>
          ),
        })}
      </div>
    )
  }

  // ── Inline layout (default) — compact bordered card in an item's edit form ───
  return (
    <div className="rounded-card border border-border bg-canvas/50 p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Palette className="w-4 h-4 text-primary-strong" />
        <h4 className="text-meta font-semibold uppercase tracking-wider text-text">Design</h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
        {/* Live preview */}
        <div className="shrink-0">
          <div
            // // KEEP bg-white: a QR reader needs a true-white quiet zone behind the modules, so this fill is a scanner requirement rather than a themed surface.
            className="w-40 h-40 mx-auto rounded-lg border border-border bg-white p-1.5 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="mt-2">{presets}</div>
          {warningsBox}
        </div>

        {/* Controls */}
        {controls}
      </div>
    </div>
  )
}

// A labeled control group — a small uppercase header over its rows, so the design
// controls read as tight, named sections (Colors · Shape · Logo · Frame) instead of
// an undifferentiated stack.
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-3xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      {children}
    </div>
  )
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-subtle">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 rounded-control border border-border bg-transparent p-0"
      />
    </label>
  )
}

/** One labelled style picker. Renamed off `Select` when this file adopted the primitive of that
 *  name; it is the labelled ROW, not the control. The visible span names the control by wrapping
 *  it, so no aria-label is minted here. */
function StyleSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: [string, string][]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      {label && <span className="text-subtle">{label}</span>}
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
        wrapperClassName="inline-block w-max max-w-full"
      />
    </label>
  )
}
