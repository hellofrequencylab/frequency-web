import type { ReactNode } from "react";

/**
 * Design token gallery (docs/DESIGN.md). The live reference for the Resonance
 * system: every color, type size, space step, radius, elevation, and motion
 * token, plus a few token-driven component previews. If a token changes in
 * globals.css, it changes here.
 */
export const metadata = { title: "Resonance — Style" };

const NEUTRALS = [
  ["bg-base", "base", "0.15 0.01 285"],
  ["bg-surface", "surface", "0.19 0.012 285"],
  ["bg-raised", "raised", "0.23 0.014 285"],
  ["bg-hover", "hover", "0.28 0.016 285"],
  ["bg-line", "line", "0.34 0.016 285"],
];

const ACCENTS = [
  ["bg-pulse", "pulse", "0.66 0.20 300"],
  ["bg-signal", "signal", "0.80 0.17 150"],
  ["bg-spark", "spark", "0.83 0.14 85"],
  ["bg-alert", "alert", "0.64 0.20 25"],
  ["bg-cool", "cool", "0.75 0.13 220"],
];

const TYPE = [
  ["text-3xl", "font-display", "3xl / marquee", "Resonance"],
  ["text-2xl", "font-display", "2xl / page title", "Synthwave Lounge"],
  ["text-xl", "font-display", "xl / section", "Now playing"],
  ["text-lg", "font-sans", "lg / lead", "Take a seat and spin."],
  ["text-base", "font-sans", "base / body", "The floor votes, and the crowd decides."],
  ["text-sm", "font-sans", "sm / control", "Add to queue"],
  ["text-xs", "font-sans", "xs / meta", "3 here now"],
  ["text-2xs", "font-sans", "2xs / micro", "LIVE"],
];

const SPACE = [
  ["w-1", "1 / 4px"],
  ["w-2", "2 / 8px"],
  ["w-3", "3 / 12px"],
  ["w-4", "4 / 16px"],
  ["w-6", "6 / 24px"],
  ["w-8", "8 / 32px"],
  ["w-12", "12 / 48px"],
  ["w-16", "16 / 64px"],
];

const RADIUS = [
  ["rounded-sm", "sm / 8"],
  ["rounded-md", "md / 12"],
  ["rounded-lg", "lg / 16"],
  ["rounded-pill", "pill"],
];

const MOTION = [
  ["instant", "80ms", "press, toggle"],
  ["fast", "140ms", "hover, focus, chip"],
  ["base", "220ms", "enter/leave, tab"],
  ["slow", "360ms", "room transitions"],
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-xl mb-1">{title}</h2>
      {note && <p className="text-sm text-mute mb-4">{note}</p>}
      {children}
    </section>
  );
}

export default function StyleGallery() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-12">
        <h1 className="font-display text-3xl">Resonance style</h1>
        <p className="text-base text-soft mt-1">
          The living token reference. Spec in <code className="font-mono text-pulse">docs/DESIGN.md</code>.
        </p>
      </header>

      <Section title="Surfaces and lines" note="Dark-first neutrals, violet-tinted (hue 285).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {NEUTRALS.map(([bg, name, ok]) => (
            <div key={name} className="rounded-md border bg-surface p-2">
              <div className={`${bg} h-14 w-full rounded-sm border`} />
              <div className="mt-2 text-xs text-soft">{name}</div>
              <div className="font-mono text-2xs text-mute">{ok}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Accents" note="One accent per context. Pulse is the only thing that glows.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ACCENTS.map(([bg, name, ok]) => (
            <div key={name} className="rounded-md border bg-surface p-2">
              <div className={`${bg} h-14 w-full rounded-sm`} />
              <div className="mt-2 text-xs text-soft">{name}</div>
              <div className="font-mono text-2xs text-mute">{ok}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Text" note="Primary, secondary, tertiary.">
        <div className="space-y-1 rounded-md border bg-surface p-4">
          <p className="text-base text-text">text — primary reading color</p>
          <p className="text-base text-soft">soft — secondary</p>
          <p className="text-base text-mute">mute — meta and captions</p>
        </div>
      </Section>

      <Section title="Typography" note="Space Grotesk for display, Inter for UI.">
        <div className="space-y-4 rounded-md border bg-surface p-5">
          {TYPE.map(([size, family, label, sample]) => (
            <div key={label} className="flex items-baseline gap-4">
              <span className="w-40 shrink-0 font-mono text-2xs text-mute">{label}</span>
              <span className={`${size} ${family}`}>{sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing" note="4px base.">
        <div className="space-y-2 rounded-md border bg-surface p-5">
          {SPACE.map(([w, label]) => (
            <div key={label} className="flex items-center gap-4">
              <span className="w-20 shrink-0 font-mono text-2xs text-mute">{label}</span>
              <span className={`${w} h-3 rounded-sm bg-pulse`} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius">
        <div className="flex flex-wrap gap-4">
          {RADIUS.map(([r, label]) => (
            <div key={label} className="text-center">
              <div className={`${r} h-16 w-16 border bg-raised`} />
              <div className="mt-2 font-mono text-2xs text-mute">{label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation and glow" note="Dark elevation reads as a lighter surface plus a soft glow.">
        <div className="flex flex-wrap gap-4">
          <div className="rounded-md bg-surface p-4 text-sm" style={{ boxShadow: "var(--shadow-soft)" }}>
            shadow-soft
          </div>
          <div className="rounded-md bg-surface p-4 text-sm" style={{ boxShadow: "var(--glow-pulse)" }}>
            glow-pulse
          </div>
          <div className="rounded-md bg-surface p-4 text-sm" style={{ boxShadow: "var(--glow-signal)" }}>
            glow-signal
          </div>
        </div>
      </Section>

      <Section title="Motion" note="Purposeful, ease-out, reduced-motion aware.">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MOTION.map(([name, ms, use]) => (
            <div key={name} className="rounded-md border bg-surface p-3">
              <div className="text-sm text-text">{name}</div>
              <div className="font-mono text-2xs text-mute">{ms}</div>
              <div className="text-2xs text-soft">{use}</div>
            </div>
          ))}
        </div>
        <div
          className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-surface text-lg"
          style={{ animation: "rs-pulse-ring 2.5s var(--ease-out) infinite" }}
          aria-hidden
        >
          🎧
        </div>
        <span className="ml-3 align-middle text-sm text-mute">now-playing pulse</span>
      </Section>

      <Section title="Components (preview)" note="Token-driven primitives. Full kit is Step B.">
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-surface p-5">
          <button className="rounded-sm bg-pulse px-4 py-2 text-sm font-medium text-text">Take the decks</button>
          <button className="rounded-sm border bg-transparent px-4 py-2 text-sm text-soft">Lurk</button>
          <button className="rounded-sm px-4 py-2 text-sm text-alert">Leave</button>

          <span className="inline-flex items-center gap-2 rounded-pill border bg-raised px-2 py-1 text-sm">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-spark text-base">🦊</span>
            <b className="text-text">Guest</b>
            <span className="h-2 w-2 rounded-pill bg-signal" />
          </span>

          <span className="inline-flex items-center gap-1 rounded-pill bg-surface px-2 py-1 text-xs text-signal">
            ● 12 here
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-spark">⚡ 240</span>
        </div>
      </Section>
    </main>
  );
}
