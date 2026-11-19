// THE MINDLESS SITE TIMER SHEET (LIVE-2392): the few rules the running SessionPlayer needs on top of the design's own sheet
// (lib/theme/mindless-kit-css.ts). Scoped to [data-house-theme="mindless"] like the rest (ADR-1906), and drawn only from the design
// system's tokens: no colour is named here. The drip clock gives every numeral the same box, because Rubik Wet Paint's digits are
// not the same width and a clock that shuffles sideways each second is not calm.
const M = '[data-house-theme="mindless"]'

export const MINDLESS_TIMER_CSS = `
${M} button.ml-player__play{padding:0;font:inherit;-webkit-appearance:none;appearance:none}
${M} .ml-player.is-done .ml-player__guide,${M} .ml-player.is-paused .ml-player__guide{font-weight:800}
${M} .ml-timer{margin-top:clamp(24px,3vw,40px);display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:var(--gap,24px);align-items:start}
${M} .ml-timer>*{min-width:0}
${M} .ml-timer .ml-player{max-width:none;width:100%}
${M} .ml-timer .ml-choice{width:100%}
${M} .ml-player--timer{padding:clamp(24px,3vw,40px)}
${M} .ml-player--timer .ml-player__play{width:76px;height:76px}
${M} .ml-player__clock{margin:var(--space-md) 0 0;font-family:var(--font-display);font-weight:400;font-size:clamp(72px,10vw,136px);line-height:1;text-shadow:var(--depth-ink);white-space:nowrap}
${M} .ml-player__clock span{display:inline-block;width:.66em;text-align:center}
${M} .ml-player__clock span.is-colon{width:.3em}
${M} .ml-player--raised .ml-player__clock{color:var(--th-accent)}
${M}[data-th="day"] .ml-player--raised .ml-player__clock{color:var(--th-text);text-shadow:none}
@media (max-width:860px){${M} .ml-timer{grid-template-columns:1fr}${M} .ml-timer__lengths{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}
`
