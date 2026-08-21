'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CARRY THE SPACE THEME THROUGH A PORTAL (ADR-578 + ADR-1017).
//
// 🔴 THE DEFECT THIS EXISTS FOR. A Space's page theme is established on a DIV, not on <html>:
// `components/spaces/accent-scope.tsx` renders `<div data-space-theme={theme} style={accentVars}>`
// inside the profile subtree, and both the `[data-space-theme]` CSS blocks and the
// `--color-primary*` overrides hang off that node.
//
// `Dialog` and `WizardModal` both `createPortal(…, document.body)`, which lands them OUTSIDE that
// div. So a Spark or a Dialog opened from a themed Space page rendered in the HOST palette and the
// HOST fonts, while `StudioWindow` — which does not portal — rendered in the Space's. Two sibling
// surfaces, opposite behaviour, and no gate could see it because every token involved is legal.
//
// THE PORTAL IS NOT THE BUG AND MUST NOT BE REMOVED. `dialog.tsx` documents why it exists: inside a
// transformed or clipped ancestor (the sliding admin rail), a `fixed inset-0` overlay is trapped and
// renders as a narrow sidebar panel instead of covering the viewport. Portaling escapes every such
// context. The fix is to carry the theme ACROSS the portal, not to stop portaling.
//
// ── WHY A REF CALLBACK AND NOT STATE ────────────────────────────────────────────────────────────
// The obvious shape is `useEffect` + `setState`, and it is wrong twice: it costs a second render
// for something that is settled before paint, and it trips the repo's set-state-in-effect lint
// (cascading renders). What we are doing is mirroring one DOM node's theme onto another DOM node,
// so a ref callback does it directly, once, at mount. No state, no effect, no re-render.
//
// The theme cannot change while a popup is open — it is a property of the route underneath — so
// there is nothing to re-sync. If that ever stops being true, this becomes a subscription, not a
// setState.
//
// WHY READ THE INLINE STYLE RATHER THAN getComputedStyle: the accent is applied as inline custom
// properties on that same node (accent-scope.tsx:31-33). Reading `el.style` gets precisely what the
// Space set and nothing else, so a host default is never copied down and frozen — absent an
// override, the token simply keeps inheriting as normal.
//
// FAIL-SAFE: no themed ancestor (the common case — most of the app is not inside a Space) applies
// nothing at all, so the popup renders exactly as it does today.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, type RefObject } from 'react'

/** The custom properties AccentScope sets inline (lib/spaces/accent.ts `AccentVars`). Copied BY NAME
 *  so this can never scrape unrelated inline styles off the ancestor. */
const ACCENT_PROPS = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-strong',
  '--color-primary-bg',
  '--color-text-on-primary',
] as const

/**
 * Returns a ref callback for the PORTALED root. On mount it copies the Space theme in force at
 * `anchor`'s position — the theme id and the accent custom properties — onto that root, so the
 * portaled subtree resolves exactly as it would have in place.
 *
 * `anchor` must point at a node still rendered IN PLACE (the sentinel the opener leaves behind).
 */
export function usePortaledSpaceTheme(anchor: RefObject<HTMLElement | null>) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) return
      const host = anchor.current?.closest<HTMLElement>('[data-space-theme]')
      if (!host) return
      const id = host.getAttribute('data-space-theme')
      if (id) node.setAttribute('data-space-theme', id)
      for (const prop of ACCENT_PROPS) {
        const v = host.style.getPropertyValue(prop)
        if (v) node.style.setProperty(prop, v)
      }
    },
    [anchor],
  )
}
