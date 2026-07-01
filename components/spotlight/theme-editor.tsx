'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Plus, Trash2, Palette } from 'lucide-react'
import {
  type SpotlightTheme,
  type SpotlightBg,
  type GradientStop,
  type CardRadius,
  type CardShadow,
  type CardStyle,
  type SpotlightFontId,
  SPOTLIGHT_FONTS,
  THEME_PRESETS,
  EMPTY_THEME,
  buildGradientCss,
  readableOn,
} from '@/lib/spotlight/theme'
import { saveSpotlightTheme } from '@/app/(main)/settings/profile/spotlight-actions'

const FIELD = 'rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none'
const SECTION = 'space-y-2'
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-subtle'

// A colour control: a native swatch + a hex field, with an optional "auto/none" clear.
function ColorField({
  value, onChange, allowClear, clearLabel = 'Auto',
}: {
  value: string | null
  onChange: (v: string | null) => void
  allowClear?: boolean
  clearLabel?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value ?? '#888888'}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border-strong bg-surface"
        aria-label="Pick colour"
      />
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value.trim()
          onChange(/^#[0-9a-fA-F]{6}$/.test(v) ? v : v === '' ? null : value)
        }}
        placeholder="#rrggbb"
        className={`${FIELD} w-28 font-mono`}
        maxLength={7}
      />
      {allowClear && (
        <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-subtle hover:text-text">
          {value ? 'Clear' : clearLabel}
        </button>
      )}
    </div>
  )
}

// Controlled: the parent (the builder) owns `value` so the live preview reflects edits as
// they happen. The Save button persists the current value. `showPreview` keeps the compact
// inline swatch preview for the standalone (non-split) layout; the builder hides it since it
// renders the full page live.
//
// `onCommit` OVERRIDES where the explicit Save button writes: when the Puck editor passes it,
// Save routes the value into the shared DRAFT autosave (via onCommit) instead of the live
// `saveSpotlightTheme` — so nothing here touches the public page directly. When omitted (the
// legacy standalone builder), Save keeps writing the live theme node as before.
export function SpotlightThemeEditor({
  value, onChange, onCommit, showPreview = true,
}: {
  value: SpotlightTheme
  onChange: (t: SpotlightTheme) => void
  /** Optional: route the explicit Save to the parent (draft path) instead of the live theme write. */
  onCommit?: (t: SpotlightTheme) => void
  showPreview?: boolean
}) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function patch(p: Partial<SpotlightTheme>) {
    onChange({ ...value, ...p })
  }
  function setBg(bg: SpotlightBg) {
    patch({ bg })
  }

  function save() {
    setError('')
    // Draft path: hand the value to the parent's shared autosave, never the live theme write.
    if (onCommit) {
      onCommit(value)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      return
    }
    start(async () => {
      const res = await saveSpotlightTheme(value)
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  // ── Inline swatch preview values ──
  const previewBg =
    value.bg.kind === 'gradient' ? buildGradientCss(value.bg.gradient)
    : value.bg.kind === 'solid' ? value.bg.color
    : 'var(--color-canvas)'
  const previewTextRef =
    value.bg.kind === 'solid' ? value.bg.color
    : value.bg.kind === 'gradient' ? value.bg.gradient.stops[0].color
    : value.surface ?? '#ffffff'
  const previewText = value.text ?? readableOn(previewTextRef)
  const previewFont = SPOTLIGHT_FONTS.find((f) => f.id === value.font.body)?.stack
  const previewHeadingFont = SPOTLIGHT_FONTS.find((f) => f.id === value.font.heading)?.stack
  const radiusPx = { sm: 6, md: 12, lg: 18, xl: 28 }[value.card.radius]
  const accent = value.accent ?? '#7c6f5a'

  const gradient = value.bg.kind === 'gradient' ? value.bg.gradient : null
  function setGradient(g: NonNullable<typeof gradient>) {
    setBg({ kind: 'gradient', gradient: g })
  }
  function setStop(i: number, p: Partial<GradientStop>) {
    if (!gradient) return
    setGradient({ ...gradient, stops: gradient.stops.map((s, k) => (k === i ? { ...s, ...p } : s)) })
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-text">
        <Palette className="h-4 w-4 text-primary-strong" /> Theme
      </p>

      {/* Presets */}
      <div className={SECTION}>
        <p className={LABEL}>Quick start</p>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.theme)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(EMPTY_THEME)}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-subtle transition-colors hover:bg-surface-elevated"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Inline swatch preview (hidden in the split builder, which shows the full page live) */}
      {showPreview && (
        <div className="overflow-hidden rounded-xl border border-border-strong" style={{ background: previewBg }}>
          <div className="flex flex-col items-center gap-2 p-5">
            <p className="text-lg font-bold" style={{ color: previewText, fontFamily: previewHeadingFont }}>Your name</p>
            <div
              className="w-full max-w-[200px] px-4 py-2.5 text-center text-sm font-semibold"
              style={{
                borderRadius: radiusPx,
                background: value.card.style === 'glass' ? `${(value.surface ?? '#ffffff')}8c` : (value.surface ?? '#ffffff'),
                color: readableOn(value.surface ?? '#ffffff'),
                backdropFilter: value.card.style === 'glass' ? 'blur(8px)' : undefined,
                boxShadow: value.card.shadow === 'strong' ? '0 10px 30px rgba(0,0,0,0.18)' : value.card.shadow === 'soft' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                fontFamily: previewFont,
              }}
            >
              A link
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: accent, color: readableOn(accent) }}>Accent</span>
          </div>
        </div>
      )}

      {/* Accent */}
      <div className={SECTION}>
        <p className={LABEL}>Accent colour</p>
        <ColorField value={value.accent} onChange={(v) => patch({ accent: v })} allowClear clearLabel="Default" />
      </div>

      {/* Background */}
      <div className={SECTION}>
        <p className={LABEL}>Background</p>
        <div className="flex gap-1.5">
          {(['none', 'solid', 'gradient'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                setBg(
                  k === 'none' ? { kind: 'none' }
                  : k === 'solid' ? { kind: 'solid', color: value.surface ?? '#1b1530' }
                  : { kind: 'gradient', gradient: { type: 'linear', angle: 160, animated: false, speed: 12, stops: [{ color: '#ff9a3c', pos: 0 }, { color: '#7b2ff7', pos: 100 }] } },
                )
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                value.bg.kind === k ? 'border-primary-strong bg-primary-bg text-primary-strong' : 'border-border text-text hover:bg-surface-elevated'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {value.bg.kind === 'solid' && (
          <ColorField value={value.bg.color} onChange={(v) => setBg(v ? { kind: 'solid', color: v } : { kind: 'none' })} />
        )}

        {gradient && (
          <div className="space-y-2 rounded-xl border border-border p-2">
            <div className="flex items-center gap-2">
              <select
                value={gradient.type}
                onChange={(e) => setGradient({ ...gradient, type: e.target.value === 'radial' ? 'radial' : 'linear' })}
                className={`${FIELD} w-auto`}
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
              {gradient.type === 'linear' && (
                <label className="flex flex-1 items-center gap-2 text-xs text-muted">
                  Angle
                  <input
                    type="range" min={0} max={360} step={5} value={gradient.angle}
                    onChange={(e) => setGradient({ ...gradient, angle: Number(e.target.value) })}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-9 tabular-nums text-right">{gradient.angle}°</span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-text">
                <input
                  type="checkbox"
                  checked={gradient.animated}
                  onChange={(e) => setGradient({ ...gradient, animated: e.target.checked })}
                  className="accent-primary"
                />
                Animate
              </label>
              {gradient.animated && (
                <label className="flex flex-1 items-center gap-2 text-xs text-muted">
                  Speed
                  <input
                    type="range" min={4} max={40} step={1} value={gradient.speed}
                    onChange={(e) => setGradient({ ...gradient, speed: Number(e.target.value) })}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-12 text-right tabular-nums">{gradient.speed}s</span>
                </label>
              )}
            </div>
            {gradient.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <ColorField value={s.color} onChange={(v) => v && setStop(i, { color: v })} />
                <input
                  type="range" min={0} max={100} step={1} value={s.pos}
                  onChange={(e) => setStop(i, { pos: Number(e.target.value) })}
                  className="flex-1 accent-primary"
                />
                <span className="w-9 tabular-nums text-right text-xs text-muted">{s.pos}%</span>
                {gradient.stops.length > 2 && (
                  <button type="button" onClick={() => setGradient({ ...gradient, stops: gradient.stops.filter((_, k) => k !== i) })} className="shrink-0 rounded-md p-1 text-subtle hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {gradient.stops.length < 4 && (
              <button
                type="button"
                onClick={() => setGradient({ ...gradient, stops: [...gradient.stops, { color: '#ffffff', pos: 100 }] })}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add stop
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card colour + text */}
      <div className="grid grid-cols-2 gap-3">
        <div className={SECTION}>
          <p className={LABEL}>Card colour</p>
          <ColorField value={value.surface} onChange={(v) => patch({ surface: v })} allowClear clearLabel="Default" />
        </div>
        <div className={SECTION}>
          <p className={LABEL}>Text colour</p>
          <ColorField value={value.text} onChange={(v) => patch({ text: v })} allowClear clearLabel="Auto" />
        </div>
      </div>

      {/* Fonts */}
      <div className="grid grid-cols-2 gap-3">
        <div className={SECTION}>
          <p className={LABEL}>Heading font</p>
          <select value={value.font.heading} onChange={(e) => patch({ font: { ...value.font, heading: e.target.value as SpotlightFontId } })} className={`${FIELD} w-full`}>
            {SPOTLIGHT_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div className={SECTION}>
          <p className={LABEL}>Body font</p>
          <select value={value.font.body} onChange={(e) => patch({ font: { ...value.font, body: e.target.value as SpotlightFontId } })} className={`${FIELD} w-full`}>
            {SPOTLIGHT_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {/* Card style */}
      <div className="grid grid-cols-3 gap-3">
        <div className={SECTION}>
          <p className={LABEL}>Corners</p>
          <select value={value.card.radius} onChange={(e) => patch({ card: { ...value.card, radius: e.target.value as CardRadius } })} className={`${FIELD} w-full`}>
            <option value="sm">Sharp</option>
            <option value="md">Soft</option>
            <option value="lg">Round</option>
            <option value="xl">Pill</option>
          </select>
        </div>
        <div className={SECTION}>
          <p className={LABEL}>Shadow</p>
          <select value={value.card.shadow} onChange={(e) => patch({ card: { ...value.card, shadow: e.target.value as CardShadow } })} className={`${FIELD} w-full`}>
            <option value="none">None</option>
            <option value="soft">Soft</option>
            <option value="strong">Strong</option>
          </select>
        </div>
        <div className={SECTION}>
          <p className={LABEL}>Surface</p>
          <select value={value.card.style} onChange={(e) => patch({ card: { ...value.card, style: e.target.value as CardStyle } })} className={`${FIELD} w-full`}>
            <option value="solid">Solid</option>
            <option value="glass">Glass</option>
          </select>
        </div>
      </div>

      {/* Header / cover band framing */}
      <div className={SECTION}>
        <p className={LABEL}>Cover band</p>
        <label className="flex items-center gap-1.5 text-xs font-medium text-text">
          <input
            type="checkbox"
            checked={value.header.show}
            onChange={(e) => patch({ header: { ...value.header, show: e.target.checked } })}
            className="accent-primary"
          />
          Show cover photo
        </label>
        {value.header.show && (
          <>
            <p className="text-2xs text-muted">Frames your profile header photo at the top of the page.</p>
            <label className="flex items-center justify-between text-xs text-muted">
              <span>Height</span><span className="tabular-nums">{value.header.height}px</span>
            </label>
            <input
              type="range" min={80} max={360} step={8} value={value.header.height}
              onChange={(e) => patch({ header: { ...value.header, height: Number(e.target.value) } })}
              className="w-full accent-primary"
            />
            <label className="flex items-center justify-between text-xs text-muted">
              <span>Position up/down</span><span className="tabular-nums">{value.header.focusY}%</span>
            </label>
            <input
              type="range" min={0} max={100} step={1} value={value.header.focusY}
              onChange={(e) => patch({ header: { ...value.header, focusY: Number(e.target.value) } })}
              className="w-full accent-primary"
            />
          </>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {pending ? 'Saving…' : saved ? 'Saved' : onCommit ? 'Save draft' : 'Save theme'}
      </button>
    </div>
  )
}
