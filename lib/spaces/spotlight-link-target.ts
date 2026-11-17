import { safeUrl } from '@/lib/entity-blocks/block-content'

// THE CLICK TARGET OF ONE LINK IN A SPACE'S LINKS BLOCK (LIVE-2327). Link cards count presses by their card id
// (LIVE-856); a free link has no id, so its target is `link:` plus a short hash of its address. The hash survives
// the owner reordering the list, and the console maps it back to the link's label. PURE, no dependencies beyond
// the URL sanitizer, so the public renderer and the console share it.

/** `link:<hash>` for one link address. FNV-1a 32 bit, base 36 (at most 7 characters). */
export function spotlightLinkTarget(url: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `link:${(h >>> 0).toString(36)}`
}

/** The console's labels for the owner's links: target to label (the address when unlabeled). `bags` are the
 *  Links blocks' saved content; the first label for an address wins. */
export function spotlightLinkLabels(bags: unknown[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const bag of bags) {
    const items = (bag as { items?: unknown } | null | undefined)?.items
    for (const it of Array.isArray(items) ? (items as Array<{ label?: unknown; url?: unknown }>) : []) {
      const url = safeUrl(it?.url)
      if (!url) continue
      const target = spotlightLinkTarget(url)
      if (!labels.has(target)) labels.set(target, typeof it.label === 'string' && it.label.trim() ? it.label : url)
    }
  }
  return labels
}
