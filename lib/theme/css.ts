// Theme → CSS — pure. Turns a validated token set into a scoped `<style>` body that
// overrides the code DAWN/skin tokens for the matching attribute value. The selector
// attribute is passed in — `data-skin` for a skin theme, `data-occasion` for an occasion
// overlay — because the two axes are applied via different attributes on <html>. The
// selectors are deliberately MORE specific than the code skin/occasion rules
// (`html[<attr>="…"]` / `html.dark[<attr>="…"]`, two element/attribute compounds = (0,1,2)
// vs the code rules' single attribute (0,1,0)), so the DB theme wins regardless of order.
//
// SECURITY: this emits the slug and token values verbatim. It assumes its input is ALREADY
// validated by lib/theme/validate.ts (allowlisted names, injection-safe values, safe slug),
// and re-guards the slug via isSafeSlug as a belt-and-braces check before building any
// selector. Pass only the output of validateThemeTokens here.

import { isSafeSlug } from './validate'

/** Emit `<name>: <value>;` pairs for an already-validated block (skips empty values). */
function declarations(tokens: Record<string, string>): string {
  let out = ''
  for (const [name, value] of Object.entries(tokens)) {
    if (!value) continue
    out += `${name}:${value};`
  }
  return out
}

/**
 * Build the scoped CSS for a theme. Returns '' for an unsafe/empty slug. The `attr` selects
 * which attribute the rules target — `data-skin` for a skin theme, `data-occasion` for an
 * occasion overlay — so each axis matches the attribute the shell actually sets. Otherwise
 * emits two rules selected by the theme's slug (the active `attr` value):
 *
 *   html[<attr>="<slug>"]{ <feel + light tokens> }
 *   html.dark[<attr>="<slug>"]{ <dark tokens> }
 *
 * Feel + light tokens go on the base rule (feel is mode-agnostic); dark tokens go on the
 * `.dark` rule so the cascade resolves correctly per mode. Empty rules are omitted.
 */
export function themeToCss(
  attr: 'data-skin' | 'data-occasion',
  slug: string,
  tokens: { light: Record<string, string>; dark: Record<string, string>; feel: Record<string, string> },
): string {
  if (!isSafeSlug(slug)) return ''

  // Feel tokens are mode-agnostic, so they ride the base (light) rule.
  const base = declarations(tokens.feel) + declarations(tokens.light)
  const dark = declarations(tokens.dark)

  let css = ''
  if (base) css += `html[${attr}="${slug}"]{${base}}`
  if (dark) css += `html.dark[${attr}="${slug}"]{${dark}}`
  return css
}
