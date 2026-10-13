// THE WEBSITE EDITOR'S SKIN SWITCH (ADR-1737). The editor's markup carries DAWN's `we-*` class names; under
// the Frequency design (SITE_DESIGN, build-time) the same elements wear the design's editor kit instead
// (app/themes/frequency/kit-editor.css, from design_handoff/frequency/templates/admin/editor/editor.css),
// whose class names are the design's, verbatim. `k()` translates a className string; under DAWN it returns
// the input untouched, so a DAWN build renders byte-for-byte what it always has.
//
// Only the CLASS changes here. The document model, saving, validation and every handler are the same
// code under both designs; the structural differences (the page picker menu, the inspector tabs, the
// Vera bar) are branches in shell.tsx that call the same functions.

import { SITE_DESIGN } from '@/lib/theme/design'

export const FQ_EDITOR = SITE_DESIGN === 'frequency'

/** DAWN class → the Frequency kit's class (an empty string drops it). Two-word DAWN pairs come first. */
const PAIRS: [string, string][] = [
  ['we-action secondary', 'btn sm'],
]
const KIT: Record<string, string> = {
  'we-shell': 'pe',
  'we-top': 'top',
  'we-icon': 'ib',
  'we-brand': 'brand',
  'we-save': 'save',
  'we-spacer': 'sp',
  'we-device': 'seg dev',
  'we-action': 'btn sm pa',
  'we-presence': 'faces',
  'we-tabs': 'tabs',
  'we-caption': 'cap',
  'we-row': 'row',
  'we-field': 'fld',
  'we-note': 'note',
  'we-actions': 'acts',
  'we-choice-row': 'seg wrap',
  'we-theme-card': 'theme',
  'we-theme-swatch': 'sw',
  'we-swatch-list': 'swatches',
  'we-swatch': 'swatch',
  'we-stage': 'stage',
  'we-frame-scroller': 'scroller',
  'we-frame': 'frame',
  'we-inspector-head': 'ih',
  'we-overlay': 'ov on',
  'we-modal': 'modal',
  'we-drawer': 'drw',
  'we-proposal': 'note',
  'we-error': 'note err',
  'we-version': 'ver',
  'we-comment': 'cmt-card',
  'we-comment-reply': 'cmt-reply',
  'we-share-card': 'share',
  'we-layer-slot': 'slot',
  'we-search': 'in',
  'we-save-alert': 'save-alert',
}

/** Translate a className for the active design. PURE (over the build-time switch). */
export function k(names: string, fq: boolean = FQ_EDITOR): string {
  if (!fq) return names
  let rest = names
  const out: string[] = []
  for (const [pair, kit] of PAIRS) {
    if ((` ${rest} `).includes(` ${pair} `)) { out.push(kit); rest = (` ${rest} `).replace(` ${pair} `, ' ').trim() }
  }
  for (const name of rest.split(/\s+/)) {
    if (!name) continue
    out.push(name in KIT ? KIT[name] : name)
  }
  return out.filter(Boolean).join(' ')
}

/** The kit marks a chosen tab, segment or row with `.on`; DAWN reads aria state instead. */
export function on(active: boolean, fq: boolean = FQ_EDITOR): string {
  return fq && active ? ' on' : ''
}
