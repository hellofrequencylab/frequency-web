'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { Palette, Upload, X, RotateCcw, TriangleAlert } from 'lucide-react'
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

// The "make them beautiful" editor: live-previewed controls over a QrStyle.
// Renders the exact same SVG the server/Studio/download produce, so what the
// operator designs is what prints.
//
// Two layouts:
//   • inline (default) — a compact bordered card used inside an item's edit form.
//   • rail            — a hero preview on top + presets + stacked controls, used
//                       as the left rail of the Studio generator (editor up top).
export function StyleEditor({
  value,
  onChange,
  previewUrl,
  variant = 'inline',
  compact = false,
  presetsFooter,
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
  /** Slot rendered directly under the preset buttons (e.g. an "Archived codes" link). */
  presetsFooter?: ReactNode
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const svg = useMemo(() => renderStyledQrSvg(previewUrl, value, 240), [previewUrl, value])
  const warnings = useMemo(() => scannabilityWarnings(value), [value])

  function set<K extends keyof QrStyle>(key: K, v: QrStyle[K]) {
    onChange({ ...value, [key]: v })
  }

  function onLogoFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      if (isSafeLogoSrc(src)) set('logo', src)
    }
    reader.readAsDataURL(file)
  }

  // Compact mode shows the four core looks; the full set (incl. Forest / Gold) is
  // kept in the data for member-code defaults and the Studio.
  const visiblePresets = compact
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
            className="rounded-full border border-border px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-primary hover:bg-primary-bg hover:text-primary-strong"
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

  const controls = (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-3">
        <Swatch label="Modules" value={value.fg} onChange={(c) => set('fg', c)} />
        <Swatch label="Background" value={value.bg} onChange={(c) => set('bg', c)} />
        {!compact && (
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!value.eyeColor}
              onChange={(e) => set('eyeColor', e.target.checked ? value.fg : null)}
              className="accent-primary"
            />
            <span className="text-subtle">Eye color</span>
            {value.eyeColor && (
              <input
                type="color"
                value={value.eyeColor}
                onChange={(e) => set('eyeColor', e.target.value)}
                className="h-5 w-6 rounded border border-border bg-transparent p-0"
              />
            )}
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          label="Module shape"
          value={value.moduleShape}
          options={[
            ['square', 'Square'],
            ['rounded', 'Rounded'],
            ['dots', 'Dots'],
            ['connected', 'Connected'],
          ]}
          onChange={(v) => set('moduleShape', v as ModuleShape)}
        />
        <Select
          label="Eye frame"
          value={value.eyeShape}
          options={[
            ['square', 'Square'],
            ['rounded', 'Rounded'],
            ['circle', 'Circle'],
          ]}
          onChange={(v) => set('eyeShape', v as EyeShape)}
        />
        <Select
          label="Eye pupil"
          value={value.pupilShape}
          options={[
            ['square', 'Square'],
            ['rounded', 'Rounded'],
            ['circle', 'Circle'],
          ]}
          onChange={(v) => set('pupilShape', v as EyeShape)}
        />
      </div>

      {/* Gradient */}
      {!compact && (
      <div>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={!!value.gradient}
            onChange={(e) =>
              set('gradient', e.target.checked ? { from: value.fg, to: '#db2777', angle: 45 } : null)
            }
            className="accent-primary"
          />
          <span className="text-subtle">Gradient fill</span>
        </label>
        {value.gradient && (
          <div className="mt-2 flex flex-wrap items-center gap-3 pl-5">
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

      {/* Logo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-subtle">Center logo</span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted hover:text-text hover:bg-surface-elevated transition-colors"
        >
          <Upload className="w-3 h-3" /> Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onLogoFile(e.target.files?.[0])}
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
        <div className="flex flex-wrap gap-3 pl-1">
          <Select
            label="Logo shape"
            value={value.logoShape}
            options={[
              ['square', 'Square'],
              ['circle', 'Circle'],
            ]}
            onChange={(v) => set('logoShape', v as QrStyle['logoShape'])}
          />
          <Select
            label="Logo color"
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

      {/* Frame + CTA */}
      <label className="block">
        <span className="block text-subtle mb-1">Frame label (optional — adds a “scan me” card)</span>
        <input
          value={value.frameLabel ?? ''}
          onChange={(e) => set('frameLabel', e.target.value || null)}
          placeholder="e.g. Scan me"
          maxLength={28}
          className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-text"
        />
      </label>

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
        <div className="mb-2 flex items-center gap-1.5">
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
          className="mx-auto aspect-square w-full max-w-[220px] rounded-xl border border-border bg-white p-2 shadow-sm [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle">Presets</p>
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

  // ── Inline layout (default) — compact bordered card in an item's edit form ───
  return (
    <div className="rounded-xl border border-border bg-canvas/50 p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Palette className="w-4 h-4 text-primary-strong" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text">Design</h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
        {/* Live preview */}
        <div className="shrink-0">
          <div
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
        className="h-6 w-8 rounded border border-border bg-transparent p-0"
      />
    </label>
  )
}

function Select({
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
      <span className="text-subtle">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-canvas px-2 py-1 text-text"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
