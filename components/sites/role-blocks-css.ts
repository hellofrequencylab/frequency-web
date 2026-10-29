import { CONTRACT_THEME_IDS, coreTokensCss, type ContractThemeId } from '@/lib/theme/block-contract-tokens'
import type { WebsiteTheme } from '@/lib/sites/editor/state'

// THE ROLE BLOCKS' SHEET (docs/THEME-COHESION.md section 2, ADR-1923, LIVE-1858).
//
// Structural CSS for the eight role blocks (Hero, Steps, Offerings, Gatherings, Membership, Proof, FAQ, CTA). It reads
// ONLY the core token contract (lib/theme/block-contract-tokens.ts): no `--color-*`, no `--mn-`, no `--nk-`, and no
// literal colour or font. Markup is theme-independent: a role block emits `data-role`, `data-variant` and `data-part`,
// and this sheet targets those hooks, never a class, so a theme's presentation layer can arch a photo or set a quote in
// its voice face with `[data-theme] [data-role="proof"] [data-part="quote"]` and no new block.
//
// Layout is driven by CONTAINER width, not the viewport, so the same block reads right in the editor canvas, a phone
// preview and a published page. The sheet is emitted only on a page that carries a role block (docHasRoleBlocks), with
// the active theme's contract mapping beside it, so every other site renders byte for byte as before.

const BASE = `
[data-role]{position:relative;container-type:inline-size;background:var(--c-canvas);color:var(--c-text);font-family:var(--f-body);padding-block:var(--sp-section);line-height:1.55;-webkit-font-smoothing:antialiased}
[data-role][data-tone="surface"]{background:var(--c-surface)}
[data-role][data-tone="band"]{background:var(--c-band);color:var(--c-on-band)}
[data-role] *,[data-role] *::before,[data-role] *::after{box-sizing:border-box}
[data-role] [data-part="inner"]{width:100%;max-width:72rem;margin-inline:auto;padding-inline:var(--sp-gutter);display:grid;gap:calc(var(--sp-gap) * 2.5)}
[data-role] [data-part="heading"]{display:grid;gap:var(--sp-gap);max-width:var(--measure)}
[data-role][data-align="center"] [data-part="heading"],[data-role][data-variant="center"] [data-part="heading"]{margin-inline:auto;text-align:center;justify-items:center}
[data-role] [data-part="eyebrow"]{margin:0;font-family:var(--f-label);font-size:.75rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--c-accent-text)}
[data-role][data-tone="band"] [data-part="eyebrow"]{color:var(--c-on-band);opacity:.8}
[data-role] [data-part="title"]{margin:0;font-family:var(--f-display);font-weight:var(--w-display);letter-spacing:var(--track-display);text-transform:var(--case-heading);line-height:var(--lead-display);font-size:clamp(1.85rem,1.2rem + 3.2cqi,3.25rem);text-wrap:balance;color:inherit}
[data-role] [data-part="title"] em{font-family:var(--f-voice);font-style:italic;font-weight:400;color:var(--c-accent-text);text-transform:none}
[data-role][data-tone="band"] [data-part="title"] em{color:inherit}
[data-role] [data-part="lead"]{margin:0;font-size:1.0625rem;color:var(--c-text-muted);max-width:var(--measure);text-wrap:pretty}
[data-role][data-tone="band"] [data-part="lead"]{color:inherit;opacity:.82}
[data-role] [data-part="actions"]{display:flex;flex-wrap:wrap;gap:calc(var(--sp-gap) * .75);align-items:center}
[data-role][data-align="center"] [data-part="actions"],[data-role][data-variant="center"] [data-part="actions"]{justify-content:center}
[data-role] [data-part="cta"]{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:2.75rem;padding:.7rem 1.35rem;border:1px solid var(--c-accent);border-radius:var(--r-control);background:var(--c-accent);color:var(--c-on-accent);font-family:var(--f-label);font-size:.9375rem;font-weight:600;line-height:1.2;text-decoration:none;cursor:pointer;transition:background var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease)}
[data-role] [data-part="cta"]:hover{background:var(--c-accent-hover);border-color:var(--c-accent-hover)}
[data-role] [data-part="cta"]:focus-visible,[data-role] summary:focus-visible,[data-role] a:focus-visible{outline:2px solid var(--c-focus);outline-offset:3px}
[data-role] [data-part="cta"][data-kind="secondary"]{background:transparent;color:inherit;border-color:var(--c-line-strong)}
[data-role] [data-part="cta"][data-kind="secondary"]:hover{background:var(--c-accent-bg);border-color:var(--c-accent)}
[data-role][data-tone="band"] [data-part="cta"]{background:var(--c-on-band);border-color:var(--c-on-band);color:var(--c-band)}
[data-role][data-tone="band"] [data-part="cta"][data-kind="secondary"]{background:transparent;color:var(--c-on-band);border-color:var(--c-on-band)}
[data-role] [data-part="media"]{margin:0;overflow:hidden;border-radius:var(--r-media);clip-path:var(--frame);background:var(--c-sunken);min-width:0}
[data-role] [data-part="media"] img{display:block;width:100%;height:100%;object-fit:cover;aspect-ratio:var(--rb-ratio,4/3)}
[data-role] [data-part="item"]{min-width:0}
[data-role] [data-part="name"]{margin:0;color:inherit;font-family:var(--f-display);font-weight:var(--w-display);letter-spacing:var(--track-display);line-height:1.2;font-size:1.25rem;text-transform:var(--case-heading)}
[data-role] [data-part="body"]{margin:0;color:var(--c-text-muted);text-wrap:pretty}
[data-role][data-tone="band"] [data-part="body"]{color:inherit;opacity:.85}
[data-role] [data-part="meta"]{margin:0;font-family:var(--f-label);font-size:.8125rem;color:var(--c-text-subtle)}
[data-role] [data-part="price"]{font-family:var(--f-display);font-weight:var(--w-display);font-size:1.25rem;color:var(--c-text);white-space:nowrap}
[data-role] [data-part="index"]{font-family:var(--f-voice);font-style:italic;font-size:1.5rem;line-height:1;color:var(--c-accent-text)}
[data-role] [data-card]{background:var(--c-surface);border:1px solid var(--c-line);border-radius:var(--r-card);box-shadow:var(--shadow-card)}
[data-role][data-tone="surface"] [data-card]{background:var(--c-raised)}
[data-role] [data-part="item"]{position:relative}
[data-role] [data-part="name"] a{color:inherit;text-decoration:none}
[data-role] [data-part="name"] a::after{content:"";position:absolute;inset:0}
[data-role] [data-part="name"] a:hover{color:var(--c-accent-text)}
[data-role][data-space-top="none"]{padding-block-start:0}[data-role][data-space-top="xs"]{padding-block-start:calc(var(--sp-section) * .35)}[data-role][data-space-top="sm"]{padding-block-start:calc(var(--sp-section) * .65)}[data-role][data-space-top="md"]{padding-block-start:var(--sp-section)}[data-role][data-space-top="lg"]{padding-block-start:calc(var(--sp-section) * 1.5)}[data-role][data-space-top="xl"]{padding-block-start:calc(var(--sp-section) * 2)}
[data-role][data-space-bottom="none"]{padding-block-end:0}[data-role][data-space-bottom="xs"]{padding-block-end:calc(var(--sp-section) * .35)}[data-role][data-space-bottom="sm"]{padding-block-end:calc(var(--sp-section) * .65)}[data-role][data-space-bottom="md"]{padding-block-end:var(--sp-section)}[data-role][data-space-bottom="lg"]{padding-block-end:calc(var(--sp-section) * 1.5)}[data-role][data-space-bottom="xl"]{padding-block-end:calc(var(--sp-section) * 2)}
@media (max-width:47.99rem){[data-role][data-vis="desktop"]{display:none!important}}
@media (min-width:48rem){[data-role][data-vis="mobile"]{display:none!important}}
@media (prefers-reduced-motion:reduce){[data-role] *{transition:none!important}}
`

const HERO = `
[data-role="hero"] [data-part="inner"]{align-items:center}
[data-role="hero"] [data-part="copy"]{display:grid;gap:calc(var(--sp-gap) * 1.25);align-content:center;min-width:0}
[data-role="hero"] [data-part="title"]{font-size:clamp(2.25rem,1.3rem + 5cqi,4.5rem)}
[data-role="hero"][data-variant="split"] [data-part="inner"]{grid-template-columns:1fr}
@container (min-width:56rem){[data-role="hero"][data-variant="split"][data-media] [data-part="inner"]{grid-template-columns:1.05fr .95fr;gap:calc(var(--sp-gap) * 4)}[data-role="hero"][data-variant="split"][data-flip] [data-part="copy"]{order:2}}
[data-role="hero"][data-variant="full"]{display:grid;min-height:clamp(26rem,60vw,44rem);align-items:end;overflow:hidden;background:var(--c-band);color:var(--c-on-band)}
[data-role="hero"][data-variant="full"] [data-part="media"]{position:absolute;inset:0;border-radius:0;clip-path:none;background:var(--c-band)}
[data-role="hero"][data-variant="full"] [data-part="media"] img{height:100%;aspect-ratio:auto;opacity:.55}
[data-role="hero"][data-variant="full"] [data-part="copy"]{position:relative}
[data-role="hero"][data-variant="full"] [data-part="eyebrow"],[data-role="hero"][data-variant="full"] [data-part="title"] em{color:inherit}
[data-role="hero"][data-variant="full"] [data-part="lead"]{color:inherit;opacity:.88}
[data-role="hero"][data-variant="full"] [data-part="cta"]{background:var(--c-on-band);border-color:var(--c-on-band);color:var(--c-band)}
[data-role="hero"][data-variant="full"] [data-part="cta"][data-kind="secondary"]{background:transparent;color:var(--c-on-band);border-color:var(--c-on-band)}
[data-role="hero"][data-variant="center"] [data-part="copy"]{justify-items:center;text-align:center;margin-inline:auto;max-width:48rem}
[data-role="hero"][data-variant="center"] [data-part="media"]{max-width:56rem;width:100%;margin-inline:auto}
`

const STEPS = `
[data-role="steps"] [data-part="list"]{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-gap)}
[data-role="steps"] [data-part="item"]{display:grid;gap:calc(var(--sp-gap) * .6);align-content:start}
[data-role="steps"][data-variant="grid"] [data-part="item"]{padding:calc(var(--sp-gap) * 1.5)}
@container (min-width:44rem){[data-role="steps"][data-variant="grid"] [data-part="list"]{grid-template-columns:repeat(3,minmax(0,1fr))}}
[data-role="steps"][data-variant="timeline"] [data-part="list"]{gap:0;border-inline-start:2px solid var(--c-line-strong);margin-inline-start:.75rem}
[data-role="steps"][data-variant="timeline"] [data-part="item"]{position:relative;padding:0 0 calc(var(--sp-gap) * 2) calc(var(--sp-gap) * 2.25)}
[data-role="steps"][data-variant="timeline"] [data-part="item"]:last-child{padding-bottom:0}
[data-role="steps"][data-variant="timeline"] [data-part="index"]{position:absolute;inset-inline-start:0;inset-block-start:0;translate:calc(-50% - 1px) 0;display:grid;place-items:center;width:2rem;height:2rem;border-radius:var(--r-control);background:var(--c-accent);color:var(--c-on-accent);font-family:var(--f-label);font-style:normal;font-size:.875rem;font-weight:700}
[data-role="steps"][data-variant="strip"] [data-part="list"]{border-block:1px solid var(--c-line-strong);gap:0}
[data-role="steps"][data-variant="strip"] [data-part="item"]{padding:calc(var(--sp-gap) * 1.5) 0;border-block-end:1px solid var(--c-line)}
[data-role="steps"][data-variant="strip"] [data-part="item"]:last-child{border-block-end:0}
[data-role="steps"][data-variant="strip"] [data-part="index"]{font-size:2.5rem}
@container (min-width:44rem){[data-role="steps"][data-variant="strip"] [data-part="list"]{grid-auto-flow:column;grid-auto-columns:1fr}[data-role="steps"][data-variant="strip"] [data-part="item"]{padding:calc(var(--sp-gap) * 1.5);border-block-end:0;border-inline-end:1px solid var(--c-line)}[data-role="steps"][data-variant="strip"] [data-part="item"]:last-child{border-inline-end:0}}
`

const OFFERINGS = `
[data-role="offerings"] [data-part="list"]{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-gap)}
[data-role="offerings"] [data-part="item"]{display:grid;gap:calc(var(--sp-gap) * .5)}
[data-role="offerings"] [data-part="text"]{display:grid;gap:calc(var(--sp-gap) * .4);min-width:0}
[data-role="offerings"] [data-part="item"] [data-part="media"]{--rb-ratio:3/2}
[data-role="offerings"][data-variant="list"] [data-part="list"]{gap:0;border-block-start:1px solid var(--c-line-strong)}
[data-role="offerings"][data-variant="list"] [data-part="item"]{padding:calc(var(--sp-gap) * 1.25) 0;border-block-end:1px solid var(--c-line);align-items:baseline}
[data-role="offerings"][data-variant="list"] [data-part="media"]{display:none}
@container (min-width:40rem){[data-role="offerings"][data-variant="list"] [data-part="item"]{grid-template-columns:1fr auto;column-gap:calc(var(--sp-gap) * 2)}}
[data-role="offerings"][data-variant="cards"] [data-part="item"]{display:flex;flex-direction:column;overflow:hidden;gap:0}
[data-role="offerings"][data-variant="cards"] [data-part="text"]{flex:1;padding:calc(var(--sp-gap) * 1.25)}
[data-role="offerings"][data-variant="cards"] [data-part="price"]{padding:0 calc(var(--sp-gap) * 1.25) calc(var(--sp-gap) * 1.25)}
[data-role="offerings"][data-variant="cards"] [data-part="media"]{border-radius:0;clip-path:none}
@container (min-width:40rem){[data-role="offerings"][data-variant="cards"] [data-part="list"]{grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))}}
[data-role="offerings"][data-variant="split"] [data-part="media"]{display:none}
[data-role="offerings"][data-variant="split"] [data-part="item"]{padding:calc(var(--sp-gap) * 1.25);grid-template-columns:1fr auto;align-items:baseline;gap:calc(var(--sp-gap) * 1.5)}
@container (min-width:56rem){[data-role="offerings"][data-variant="split"] [data-part="inner"]{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);align-items:start}[data-role="offerings"][data-variant="split"] [data-part="heading"]{position:sticky;inset-block-start:calc(var(--sp-gap) * 2)}}
`

const GATHERINGS = `
[data-role="gatherings"] [data-part="list"]{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-gap)}
[data-role="gatherings"] [data-part="item"]{display:grid;grid-template-columns:auto 1fr;gap:calc(var(--sp-gap) * 1.25);align-items:center;padding:calc(var(--sp-gap) * 1.1)}
[data-role="gatherings"] [data-part="date"]{display:grid;place-items:center;align-content:center;min-width:3.75rem;padding:.55rem .5rem;border-radius:var(--r-control);background:var(--c-accent-bg);color:var(--c-accent-text);text-align:center;line-height:1.05}
[data-role="gatherings"] [data-part="date"] b{font-family:var(--f-label);font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase}
[data-role="gatherings"] [data-part="date"] span{font-family:var(--f-display);font-weight:var(--w-display);font-size:1.75rem}
[data-role="gatherings"] [data-part="text"]{display:grid;gap:.2rem;min-width:0}
[data-role="gatherings"] [data-part="empty"]{margin:0;color:var(--c-text-muted)}
[data-role="gatherings"] [data-part="item"]:has([data-part="name"] a):hover{border-color:var(--c-accent);box-shadow:var(--shadow-lift)}
[data-role="gatherings"][data-variant="rows"] [data-part="list"]{gap:0;border-block-start:1px solid var(--c-line-strong)}
[data-role="gatherings"][data-variant="rows"] [data-part="item"]{background:transparent;border:0;border-radius:0;box-shadow:none;border-block-end:1px solid var(--c-line)}
[data-role="gatherings"][data-variant="cards"] [data-part="item"]{grid-template-columns:1fr;align-content:start;justify-items:start}
@container (min-width:40rem){[data-role="gatherings"][data-variant="cards"] [data-part="list"]{grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))}}
[data-role="gatherings"][data-variant="split"] [data-part="side"]{display:grid;gap:calc(var(--sp-gap) * 1.5);align-content:start;min-width:0}
@container (min-width:56rem){[data-role="gatherings"][data-variant="split"][data-media] [data-part="inner"]{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);align-items:start}}
`

const MEMBERSHIP = `
[data-role="membership"] [data-part="list"]{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-gap)}
[data-role="membership"] [data-part="item"]{display:grid;gap:calc(var(--sp-gap) * .9);align-content:start;padding:calc(var(--sp-gap) * 1.6)}
[data-role="membership"] [data-part="item"][data-featured]{border-color:var(--c-accent);box-shadow:var(--shadow-lift)}
[data-role="membership"] [data-part="text"]{display:grid;gap:calc(var(--sp-gap) * .6);align-content:start;justify-items:start;min-width:0}
[data-role="membership"] [data-part="badge"]{justify-self:start;padding:.2rem .65rem;border-radius:var(--r-control);background:var(--c-accent);color:var(--c-on-accent);font-family:var(--f-label);font-size:.6875rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
[data-role="membership"] [data-part="price"]{font-size:2.25rem;line-height:1}
[data-role="membership"] [data-part="per"]{font-family:var(--f-label);font-size:.875rem;color:var(--c-text-subtle)}
[data-role="membership"] [data-part="features"]{list-style:none;margin:0;padding:0;display:grid;gap:.45rem;color:var(--c-text-muted);font-size:.9375rem}
[data-role="membership"] [data-part="features"] li{display:grid;grid-template-columns:auto 1fr;gap:.6rem}
[data-role="membership"] [data-part="features"] li::before{content:"";width:.5rem;height:.5rem;margin-block-start:.5rem;border-radius:var(--r-control);background:var(--c-accent)}
@container (min-width:44rem){[data-role="membership"][data-variant="tiers"] [data-part="list"]{grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));align-items:stretch}}
[data-role="membership"][data-variant="table"] [data-part="list"]{gap:0;border-block-start:1px solid var(--c-line-strong)}
[data-role="membership"][data-variant="table"] [data-part="item"]{background:transparent;border:0;border-radius:0;box-shadow:none;border-block-end:1px solid var(--c-line)}
[data-role="membership"][data-variant="table"] [data-part="item"][data-featured]{background:var(--c-accent-bg)}
@container (min-width:48rem){[data-role="membership"][data-variant="table"] [data-part="item"]{grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) auto;align-items:center;column-gap:calc(var(--sp-gap) * 2)}}
[data-role="membership"][data-variant="spotlight"] [data-part="item"][data-featured]{background:var(--c-band);color:var(--c-on-band);border-color:var(--c-band)}
[data-role="membership"][data-variant="spotlight"] [data-part="item"][data-featured] :is([data-part="body"],[data-part="features"],[data-part="per"],[data-part="price"]){color:inherit}
[data-role="membership"][data-variant="spotlight"] [data-part="item"][data-featured] [data-part="badge"]{background:var(--c-on-band);color:var(--c-band)}
[data-role="membership"][data-variant="spotlight"] [data-part="item"][data-featured] [data-part="cta"]{background:var(--c-on-band);border-color:var(--c-on-band);color:var(--c-band)}
@container (min-width:56rem){[data-role="membership"][data-variant="spotlight"] [data-part="list"]{grid-template-columns:minmax(0,1.3fr) minmax(0,.9fr);align-items:stretch}[data-role="membership"][data-variant="spotlight"] [data-part="item"][data-featured]{grid-row:span 3}}
`

const PROOF = `
[data-role="proof"] [data-part="list"]{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-gap)}
[data-role="proof"] [data-part="quote"]{margin:0;display:grid;gap:calc(var(--sp-gap) * 1.1);align-content:start}
[data-role="proof"] [data-part="quote"] blockquote{margin:0;font-family:var(--f-voice);font-style:italic;font-size:1.1875rem;line-height:1.45;text-wrap:pretty}
[data-role="proof"] [data-part="person"]{display:flex;align-items:center;gap:.75rem;min-width:0}
[data-role="proof"] [data-part="photo"]{width:2.75rem;height:2.75rem;flex:none;border-radius:var(--r-media);object-fit:cover;background:var(--c-sunken)}
[data-role="proof"] [data-part="who"]{display:grid;line-height:1.25}
[data-role="proof"] [data-part="who"] b{font-family:var(--f-label);font-weight:600}
[data-role="proof"] [data-part="rating"]{color:var(--c-accent-text);letter-spacing:.1em;font-size:.9375rem}
[data-role="proof"][data-variant="quote"] [data-part="list"]{gap:calc(var(--sp-gap) * 3)}
[data-role="proof"][data-variant="quote"] [data-part="item"]{max-width:52rem;margin-inline:auto;text-align:center}
[data-role="proof"][data-variant="quote"] [data-part="quote"]{justify-items:center}
[data-role="proof"][data-variant="quote"] blockquote{font-size:clamp(1.4rem,1rem + 2.2cqi,2.25rem);line-height:1.3}
[data-role="proof"][data-variant="wall"] [data-part="item"]{padding:calc(var(--sp-gap) * 1.5)}
@container (min-width:44rem){[data-role="proof"][data-variant="wall"] [data-part="list"]{display:block;columns:3 15rem;column-gap:var(--sp-gap)}[data-role="proof"][data-variant="wall"] [data-part="item"]{break-inside:avoid;margin-block-end:var(--sp-gap)}}
[data-role="proof"][data-variant="stats"] blockquote{font-size:clamp(1.25rem,1rem + 1.4cqi,1.75rem)}
[data-role="proof"] [data-part="stats"]{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-gap);align-content:start}
[data-role="proof"] [data-part="stat"]{display:grid;gap:.15rem;padding:calc(var(--sp-gap) * 1.1) 0;border-block-end:1px solid var(--c-line)}
[data-role="proof"] [data-part="stat"] b{font-family:var(--f-display);font-weight:var(--w-display);font-size:clamp(2rem,1.4rem + 2.5cqi,3rem);line-height:1;color:var(--c-accent-text)}
[data-role="proof"] [data-part="stat"] span{font-family:var(--f-label);font-size:.8125rem;color:var(--c-text-muted)}
@container (min-width:48rem){[data-role="proof"][data-variant="stats"] [data-part="inner"]{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);align-items:start}[data-role="proof"][data-variant="stats"] [data-part="heading"]{grid-column:1/-1}}
`

const FAQ = `
[data-role="faq"] [data-part="list"]{display:grid;gap:0;border-block-start:1px solid var(--c-line-strong);min-width:0}
[data-role="faq"] [data-part="item"]{border-block-end:1px solid var(--c-line)}
[data-role="faq"] summary{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-gap);padding:calc(var(--sp-gap) * 1.1) 0;cursor:pointer;list-style:none;font-family:var(--f-display);font-weight:var(--w-display);letter-spacing:var(--track-display);font-size:1.125rem;line-height:1.3}
[data-role="faq"] [data-part="question"]{min-width:0;text-wrap:pretty}
[data-role="faq"] summary::-webkit-details-marker{display:none}
[data-role="faq"] summary::after{content:"+";flex:none;display:grid;place-items:center;width:1.75rem;height:1.75rem;border:1px solid var(--c-line-strong);border-radius:var(--r-control);font-family:var(--f-label);font-weight:400;color:var(--c-accent-text);transition:transform var(--dur) var(--ease),background var(--dur-fast) var(--ease)}
[data-role="faq"] summary:hover::after{background:var(--c-accent-bg)}
[data-role="faq"] details[open] summary::after{transform:rotate(45deg)}
[data-role="faq"] [data-part="answer"]{margin:0;padding:0 0 calc(var(--sp-gap) * 1.25);color:var(--c-text-muted);max-width:var(--measure)}
@container (min-width:56rem){[data-role="faq"][data-variant="split"] [data-part="inner"]{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);align-items:start}[data-role="faq"][data-variant="split"] [data-part="heading"]{position:sticky;inset-block-start:calc(var(--sp-gap) * 2)}}
[data-role="faq"][data-variant="stack"] [data-part="inner"]{max-width:48rem}
[data-role="faq"][data-variant="grid"] [data-part="list"]{border:0;gap:var(--sp-gap)}
[data-role="faq"][data-variant="grid"] [data-part="item"]{padding-inline:calc(var(--sp-gap) * 1.25);background:var(--c-surface);border:1px solid var(--c-line);border-radius:var(--r-card);box-shadow:var(--shadow-card)}
@container (min-width:48rem){[data-role="faq"][data-variant="grid"] [data-part="list"]{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}}
`

const CTA = `
[data-role="cta"] [data-part="copy"]{display:grid;gap:calc(var(--sp-gap) * 1.1);min-width:0}
[data-role="cta"] [data-part="title"]{font-size:clamp(2rem,1.2rem + 3.8cqi,3.75rem)}
[data-role="cta"][data-variant="center"] [data-part="copy"]{justify-items:center;text-align:center;margin-inline:auto;max-width:44rem}
[data-role="cta"][data-variant="split"] [data-part="inner"]{align-items:center}
@container (min-width:48rem){[data-role="cta"][data-variant="split"] [data-part="inner"]{grid-template-columns:minmax(0,1.3fr) auto}}
[data-role="cta"][data-variant="band"]{background:var(--c-band);color:var(--c-on-band)}
[data-role="cta"][data-variant="band"] [data-part="inner"]{text-align:center;justify-items:center}
[data-role="cta"][data-variant="band"] [data-part="copy"]{justify-items:center}
[data-role="cta"][data-variant="band"] [data-part="eyebrow"],[data-role="cta"][data-variant="band"] [data-part="title"] em{color:inherit}
[data-role="cta"][data-variant="band"] [data-part="lead"]{color:inherit;opacity:.85}
[data-role="cta"][data-variant="band"] [data-part="cta"]{background:var(--c-on-band);border-color:var(--c-on-band);color:var(--c-band)}
[data-role="cta"][data-variant="band"] [data-part="cta"][data-kind="secondary"]{background:transparent;color:var(--c-on-band);border-color:var(--c-on-band)}
`

/** The shared chunk, then one chunk per role. Split so a test can prove each role reads only its declared tokens. */
export const ROLE_CSS_CHUNKS: Readonly<Record<string, string>> = { base: BASE, hero: HERO, steps: STEPS, offerings: OFFERINGS, gatherings: GATHERINGS, membership: MEMBERSHIP, proof: PROOF, faq: FAQ, cta: CTA }

/** Editor theme id to the contract theme whose mapping it wears. */
const CONTRACT_OF: Record<WebsiteTheme, ContractThemeId> = {
  DAWN: 'frequency', Menswork: 'bold', Wildheart: 'wildheart', Network: 'network', NetworkKit: 'network-kit', Temple: 'temple', TempleKit: 'temple-kit', Midnight: 'midnight', Designer: 'designer',
}

/** The sheet for a page that carries role blocks: the active theme's contract mapping, then the structure. */
export function roleBlocksCss(theme: WebsiteTheme): string {
  const id = CONTRACT_OF[theme] ?? CONTRACT_THEME_IDS[0]
  return `${coreTokensCss(id)}\n${Object.values(ROLE_CSS_CHUNKS).join('')}`
}

/** Does a page document carry a role block anywhere (nested slots included)? */
export function docHasRoleBlocks(doc: unknown): boolean {
  return /"type":"Role[A-Z]/.test(JSON.stringify(doc ?? null))
}
