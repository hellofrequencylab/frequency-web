// Theme → CSS — pure. Turns a validated token set into a scoped `<style>` body that
// overrides the code DAWN/skin tokens for the matching attribute value. The selector
// attribute is passed in — `data-skin` for a skin theme, `data-occasion` for an occasion
// overlay — because the two axes are applied via different attributes on <html>. The
// selectors are deliberately MORE specific than the code skin/occasion rules
// (`:root[<attr>]` / `:root [<attr>]` = (0,2,0)+ vs the code rules' single attribute (0,1,0)),
// so the DB theme wins regardless of stylesheet order. data-skin/data-occasion live on the
// shell root (a descendant of <html>), so the rules match a :root descendant.
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
 *   :root[<attr>="<slug>"], :root [<attr>="<slug>"]{ <feel + light tokens> }
 *   :root.dark[<attr>="<slug>"], :root.dark [<attr>="<slug>"]{ <dark tokens> }
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

  // data-skin / data-occasion are set on the SHELL ROOT (a descendant of <html>), so match a
  // :root descendant. Both `:root[attr]` and `:root [attr]` are emitted so the rule also applies
  // if the attribute ever sits on <html> (e.g. the freq-skin design preview). Specificity (0,2,0)+
  // beats the code skin/occasion rules' (0,1,0), so the DB theme still wins regardless of order.
  let css = ''
  if (base) css += `:root[${attr}="${slug}"],:root [${attr}="${slug}"]{${base}}`
  if (dark) css += `:root.dark[${attr}="${slug}"],:root.dark [${attr}="${slug}"]{${dark}}`
  return css
}
