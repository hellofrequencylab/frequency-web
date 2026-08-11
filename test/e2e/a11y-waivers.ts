// Named accessibility waivers: violations that are a CLOSED DECISION rather than debt.
//
// ── Why this file exists ──────────────────────────────────────────────────────
// `a11y-baselines.json` holds one integer per (surface, state, project). An integer can say
// "this surface may carry N serious+ elements". It cannot say "this ONE known, decided thing
// is accepted, and nothing else". Those are different claims, and only the second one is true
// of the brand amber.
//
// The concrete case: on 2026-08-06 the owner was shown the measurement for the primary button
// (white label on the brand amber, 2.52:1 in DAWN light and 1.88:1 in dark), was shown a
// darkened `#A06621` that would pass AA at 4.75:1, and REJECTED it — "roll it back to the
// original orange and leave the white. That rule doesn't apply here." `scripts/check-contrast.mjs`
// records that as a WAIVER with a frozen floor per state. axe, running against the painted
// pixels, had never been told, so it reported the same decision as a regression on every
// marketing route in two skins. One decision, two instruments, only one informed. This file
// informs the second one.
//
// Raising each affected context's baseline instead would have "worked", and it is precisely
// what ADR-980 forbids: the ratchet is NORMATIVE, and a count raised to swallow a known thing
// also silently permits any UNRELATED serious violation up to that number, on that surface,
// forever. A waiver names what is accepted. A count names only how much.
//
// ── The granularity, and why it is the painted colour pair and not a selector ──
// The obvious alternative is rule + CSS selector. It is worse here, in both directions:
//
//   TOO LOOSE — axe's selectors for these nodes are Tailwind class fragments: `.px-4`,
//   `.whitespace-nowrap`, `.gap-2.px-8.py-3\.5`, `.mt-7:nth-child(4) > …`. `.px-4` is not the
//   amber button; it is *every* element that happens to carry `px-4`. A selector waiver would
//   mask any future contrast failure that lands on a shared utility class.
//
//   TOO BRITTLE — the same button reports under a different selector on every page (`a[href$="start"]`,
//   `a[href$="subscribe"]`, `button[aria-label="Create"]`, `.bg-primary.text-on-primary[aria-current="page"]`),
//   and any markup edit re-rolls it. A selector list would rot into either a wildcard or a wall.
//
// The painted pair — foreground `#ffffff` on background `#e2912f` — IS the decision. It is the
// same identity `check:contrast` freezes at the token layer, it is stable across every page and
// every markup change, and it cannot collide with a different violation, because a different
// violation has different colours. Matching on the exact hex is also the freeze: if the amber
// ever drifts, in EITHER direction, the hex changes, no waiver matches, and the gate fails loudly
// so the decision gets re-made rather than inherited. That is stronger than the ratio floor
// `check:contrast` uses, which would silently keep accepting a different, darker, still-failing amber.
//
// ── What this mechanism structurally cannot do ────────────────────────────────
// It only knows how to read a `color-contrast` check's colour data. There is no selector field,
// no rule wildcard, and no count. So it CANNOT waive `target-size`, `aria-*`, `label`, or
// anything else, by construction — not by policy. The 24px tap-target failures the member-shell
// coverage found are unwaivable here, which is the correct outcome: they are defects, and they
// were fixed rather than accepted.
//
// ── Removing an entry is the goal ─────────────────────────────────────────────
// Every entry below is a fact about the shipped palette that stays printed in every run as an
// `a11y-waived` annotation, exactly as `check:contrast` prints its waived pairs. Deleting one
// because the palette was fixed is the win. Adding one is a decision, not a shortcut, and it
// needs the ADR reference filled in.

/** The one axe rule this mechanism can speak about. Deliberately not widened. */
export const WAIVABLE_RULE = 'color-contrast' as const

export interface ContrastWaiver {
  /** Always `color-contrast`. Present so the match is explicit rather than implied. */
  rule: typeof WAIVABLE_RULE
  /** Painted foreground, as axe reports it (`data.fgColor`). Lowercase 6-digit hex. */
  fg: string
  /** Painted background (`data.bgColor`). Set for a fill waiver; omitted for a shadow waiver. */
  bg?: string
  /**
   * Painted text-shadow colour (`data.shadowColor`), for axe's `fgOnShadowColor` family.
   * A shadowed node and a plain node are DIFFERENT measurements of the same button, so they
   * are frozen separately — a fill waiver never swallows the shadowed variant, and vice versa.
   */
  shadow?: string
  /** The ratio axe measured when this entry was frozen. Documentation, checked by the unit test. */
  ratio: number
  /** Where the decision lives. A waiver without a citation is just a mute button. */
  decision: string
  /** Why it ships this way, in enough detail that the next reader does not re-derive it. */
  why: string
}

const OWNER_PALETTE_DECISION =
  'Owner palette decision 2026-08-06, recorded as a frozen WAIVER in scripts/check-contrast.mjs ' +
  '(--color-text-on-primary on --color-primary); ADR-980 for why the a11y ratchet must not absorb it.'

/**
 * Frozen 2026-08-11 against run 31453092474 (preview deploy of `d11f873`). Each entry names one
 * painted pair that axe reports and the owner has already accepted.
 */
export const A11Y_WAIVERS: readonly ContrastWaiver[] = [
  // ── The primary button fill, in the three ambers that actually paint ────────
  // `--color-primary` resolves to a different amber per render state. These are the values the
  // browser painted, not the values the token file declares, and the difference matters: the
  // fourth declared amber (`#F0AD4E`, `.dark [data-skin="midnight"]`) never reaches the screen
  // in this harness, because both `.dark` and `[data-skin]` are stamped on <html> and a
  // DESCENDANT combinator cannot match an element against itself. It is therefore NOT listed:
  // a waiver for a colour nothing paints is noise that would quietly cover a future regression.
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    bg: '#e2912f',
    ratio: 2.52,
    decision: OWNER_PALETTE_DECISION,
    why:
      'White label on the DAWN light brand amber. 2.52:1 against a 4.5 bar, and under even the ' +
      '3:1 large-text floor, so no font size or weight rescues it. The owner saw the AA-passing ' +
      'darker amber (#A06621, 4.75:1) and rejected the colour. Ships knowingly.',
  },
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    bg: '#f2b14e',
    ratio: 1.87,
    decision: OWNER_PALETTE_DECISION,
    why:
      'The same white label on the dark-mode brand amber (`.dark` --color-primary). 1.87:1 is the ' +
      'worst state of the set. Both dark skins paint this value.',
  },
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    bg: '#d9852a',
    ratio: 2.86,
    decision: OWNER_PALETTE_DECISION,
    why: 'The same white label on the Midnight light brand amber ([data-skin="midnight"] --color-primary).',
  },

  // ── The same buttons, measured against their emboss shadow instead of their fill ──
  // `.text-emboss` puts `0 1px 1.5px var(--brand-emboss-dark)` under the label. Where the shadow
  // is heavy enough to dominate, axe switches to its `fgOnShadowColor` message and measures the
  // label against the SHADOW rather than the fill. It is the same element and the same decision,
  // but a different measurement, so it is frozen separately rather than folded in — the same
  // reason check-contrast.mjs records the hover fill as its own entry.
  //
  // 🔴 The emboss is a FINISH. It does not improve any ratio and must never be cited as
  // mitigation; check-contrast.mjs says the same thing about `chisel`.
  //
  // The shadow hex is the blur-weighted composite axe computed, so these ratios are reproducible
  // from the two hexes only to ~0.02 (axe rounds the composite to a hex AFTER measuring).
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    shadow: '#bf7a28',
    ratio: 3.47,
    decision: OWNER_PALETTE_DECISION,
    why: 'Embossed white label over the DAWN light amber fill (2.52:1 waived above).',
  },
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    shadow: '#b5853a',
    ratio: 3.29,
    decision: OWNER_PALETTE_DECISION,
    why: 'Embossed white label over the dark-mode amber fill (1.87:1 waived above).',
  },
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    shadow: '#b87024',
    ratio: 3.89,
    decision: OWNER_PALETTE_DECISION,
    why: 'Embossed white label over the Midnight light amber fill (2.86:1 waived above).',
  },
  {
    rule: 'color-contrast',
    fg: '#ffffff',
    shadow: '#b8863b',
    ratio: 3.21,
    decision: OWNER_PALETTE_DECISION,
    why:
      'Embossed white label over a second dark-mode amber composite. Two shadow values appear in ' +
      'the dark states because the emboss is a translucent black over fills of different depth.',
  },

  // ── The success chip ───────────────────────────────────────────────────────
  {
    rule: 'color-contrast',
    fg: '#11827a',
    bg: '#d7efea',
    ratio: 3.87,
    decision:
      'Frozen WAIVER in scripts/check-contrast.mjs (--color-success on --color-success-bg), ' +
      'floor 3.87 in every light state.',
    why:
      'Tinted success chip text at 3.87:1 against 4.5. Already a declared, frozen pair at the ' +
      'token layer; axe was reporting the same debt a second time under a different name. The ' +
      'stated fix is a -strong step for the tinted chips in light mode, which is a palette change.',
  },
]

/* ── Matching ──────────────────────────────────────────────────────────────── */

/** Structural shape of one axe check result. Matches axe-core's `CheckResult` without importing it. */
export interface CheckResultLike {
  id: string
  data?: unknown
}

/** Structural shape of one axe violation node. Matches axe-core's `Result['nodes'][number]`. */
export interface NodeLike {
  any?: readonly CheckResultLike[]
}

/** Structural shape of one axe violation. Matches axe-core's `Result`. */
export interface ViolationLike {
  id: string
  nodes: readonly NodeLike[]
}

/** The three colours a `color-contrast` check reports, normalised. `null` where axe reported none. */
export interface ContrastColors {
  fg: string | null
  bg: string | null
  shadow: string | null
  /** axe's own key for WHICH comparison failed, e.g. `fgOnShadowColor`. */
  messageKey: string | null
}

/**
 * Lowercase a 6-digit hex, or return null. Anything else axe might emit (a colour name, an
 * `rgba()`, an 8-digit hex, `undefined`) is deliberately NOT normalised into a match: an entry
 * can only ever waive what it spells out exactly.
 */
function normaliseHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null
}

/** Pull the colour data off a node's `color-contrast` check, or null if it carries none. */
export function contrastColors(node: NodeLike): ContrastColors | null {
  const check = node.any?.find((c) => c?.id === WAIVABLE_RULE)
  if (!check || typeof check.data !== 'object' || check.data === null) return null
  const data = check.data as Record<string, unknown>
  return {
    fg: normaliseHex(data.fgColor),
    bg: normaliseHex(data.bgColor),
    shadow: normaliseHex(data.shadowColor),
    messageKey: typeof data.messageKey === 'string' ? data.messageKey : null,
  }
}

/**
 * The waiver that covers this node, or null.
 *
 * Every guard here exists to stop the list matching more than it names:
 *  · a rule other than `color-contrast` can never match, whatever the entry says;
 *  · a node with no readable colour data can never match (an unparsed colour is not a known one);
 *  · direction matters — amber-on-white is a different decision from white-on-amber, and only
 *    the second is waived;
 *  · a fill entry requires the node to have NO shadow, so the shadowed measurement of the same
 *    button falls through to its own entry rather than being covered by the fill's;
 *  · a shadow entry requires axe's `fgOnShadowColor` key, so the unrelated `shadowOnBgColor`
 *    comparison is not swept up by a matching shadow hex.
 */
export function waiverForNode(ruleId: string, node: NodeLike): ContrastWaiver | null {
  if (ruleId !== WAIVABLE_RULE) return null
  const colors = contrastColors(node)
  if (!colors || !colors.fg) return null

  for (const waiver of A11Y_WAIVERS) {
    if (waiver.rule !== ruleId) continue
    if (waiver.fg !== colors.fg) continue

    if (waiver.shadow) {
      if (colors.shadow === waiver.shadow && colors.messageKey === 'fgOnShadowColor') return waiver
      continue
    }

    if (colors.shadow === null && colors.bg !== null && colors.bg === waiver.bg) return waiver
  }
  return null
}

export interface WaivedTally {
  waiver: ContrastWaiver
  count: number
}

export interface Partitioned<V extends ViolationLike> {
  /** The violations with their waived nodes removed. A violation whose nodes were ALL waived is dropped. */
  kept: V[]
  /** How many nodes survived the waivers. This is the number the ratchet compares. */
  keptCount: number
  /** What was waived, per entry, so every run prints the decisions it is standing on. */
  waived: WaivedTally[]
  /** Total waived nodes. */
  waivedCount: number
}

/**
 * Split violation nodes into "still counts" and "named, decided, accepted".
 *
 * Note the direction: waiving can only ever LOWER a context's total, so adding an entry can
 * never turn a passing context red, and removing one can never hide a regression.
 */
export function partitionWaived<V extends ViolationLike>(violations: readonly V[]): Partitioned<V> {
  const kept: V[] = []
  const tallies = new Map<ContrastWaiver, number>()
  let keptCount = 0
  let waivedCount = 0

  for (const violation of violations) {
    const keptNodes = violation.nodes.filter((node) => {
      const waiver = waiverForNode(violation.id, node)
      if (!waiver) return true
      tallies.set(waiver, (tallies.get(waiver) ?? 0) + 1)
      waivedCount += 1
      return false
    })
    keptCount += keptNodes.length
    if (keptNodes.length > 0) kept.push({ ...violation, nodes: keptNodes })
  }

  // Preserve declaration order so the annotation reads the same way every run.
  const waived = A11Y_WAIVERS.filter((w) => tallies.has(w)).map((waiver) => ({
    waiver,
    count: tallies.get(waiver) as number,
  }))

  return { kept, keptCount, waived, waivedCount }
}

/** One-line description of a waived group, for a test annotation. */
export function describeWaived({ waiver, count }: WaivedTally): string {
  const pair = waiver.shadow
    ? `${waiver.fg} on text-shadow ${waiver.shadow}`
    : `${waiver.fg} on ${waiver.bg}`
  return `${waiver.rule} × ${count} — ${pair} @ ${waiver.ratio}:1 — ${waiver.decision}`
}
