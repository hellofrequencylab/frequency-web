// THE FREE HUMAN YEAR WHEEL SKIN (design: templates/website/YearWheel.dc.html). Scoped under [data-house-theme="free-human"], so it
// can only dress the stand-alone site render (guarded by app/(main)/no-site-theme-in-member-area.test.ts). The wheel's face, its
// strokes and marks, the panel and the facts either side, the thread of months, signs and seasons below it, and the layer
// legend. Every colour reads the token block (lib/theme/free-human.ts); the sizes are the design's own. The wide layout starts at
// 860px, the same line the view's scroll mode uses.

const N = '[data-house-theme="free-human"]'
const DISPLAY = 'font-family:var(--font-display);font-weight:var(--weight-medium)'
const ITALIC = 'font-family:var(--font-display);font-style:italic;font-weight:var(--weight-regular,400)'
const LABEL = 'font-family:var(--font-inscription);text-transform:uppercase;font-size:11px;letter-spacing:.2em;color:var(--symbol-ink)'
const BARE = 'appearance:none;background:none;border:0;padding:0;margin:0;color:inherit;font:inherit;cursor:pointer;text-align:inherit'
const RING = '0 0 0 1.5px var(--symbol-ink),0 0 0 4px var(--fh-cream-50),0 0 0 5px var(--symbol-line-soft)'

export const FREE_HUMAN_WHEEL_CSS = `
${N} .fh-sec.fh-wheel{overflow:clip}
${N} .fhw{width:100%;color:var(--text-primary)}
${N} .fhw *{box-sizing:border-box}
${N} .fhw-root,${N} .fhw-stage{position:relative}
${N} .fhw button{-webkit-tap-highlight-color:transparent}
${N} .fhw button:focus-visible,${N} .fhw a:focus-visible{outline:2px solid var(--fill-primary);outline-offset:3px;border-radius:6px}

/* THE STAGE: stacked on a phone, one screen with the wheel in the middle on a wide one. */
${N} .fhw-hero{position:relative;display:flex;flex-direction:column;gap:18px;padding:18px 20px 24px}
${N} .fhw-top{display:flex;justify-content:space-between;align-items:center;gap:16px 28px;flex-wrap:wrap;flex:none}
${N} .fhw-label{${LABEL}}
${N} .fhw-nowrap{white-space:nowrap}
${N} .fhw-tools{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
${N} .fhw-modes{display:none;gap:18px;align-items:center}
${N} .fhw-modes[data-wide="true"]{display:flex}
${N} .fhw-mode{${BARE};${ITALIC};font-size:18px;padding-bottom:2px;color:var(--text-muted);border-bottom:1px solid transparent}
${N} .fhw-mode[aria-checked="true"]{color:var(--text-witch);border-bottom-color:var(--symbol-ink)}
${N} .fhw-today{${BARE};display:inline-flex;align-items:center;gap:8px;padding:8px 16px 9px;border-radius:var(--radius-pill);background:var(--gradient-violet);color:var(--text-on-fill);${ITALIC};font-size:17px;line-height:1;box-shadow:var(--aura-violet)}
${N} .fhw-today:hover{filter:brightness(1.06)}
${N} .fhw-today span{font-family:var(--font-symbol);font-style:normal;font-size:13px}
${N} .fhw-year{display:flex;align-items:center;gap:6px}
${N} .fhw-year-btn{${BARE};width:28px;height:28px;display:flex;align-items:center;justify-content:center;${DISPLAY};font-size:26px;color:var(--symbol-ink)}
${N} .fhw-year-btn:disabled{opacity:.25;cursor:default}
${N} .fhw-year-n{${DISPLAY};font-size:28px;line-height:1;color:var(--text-witch)}
${N} .fhw-title{margin:0;flex:none;text-align:center;${DISPLAY};font-size:clamp(24px,min(3.4vw,5.6vh),54px);line-height:1;color:var(--text-witch);text-wrap:balance}
${N} .fhw-title em{font-style:italic;color:var(--text-lyric)}
${N} .fhw-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"wheel wheel" "panel read";gap:28px 32px;align-items:start}

/* THE PANEL: the stop in words, right-aligned toward the wheel. */
${N} .fhw-panel{grid-area:panel;justify-self:stretch;display:flex;flex-direction:column;align-items:flex-end;text-align:right;gap:10px;min-width:0}
${N} .fhw-stop-title{margin:0;${DISPLAY};font-size:clamp(24px,2.8vw,46px);line-height:1.04;color:var(--text-witch);text-wrap:balance}
${N} .fhw-stop-sub{${ITALIC};font-size:19px;line-height:1.3;color:var(--text-secondary)}
${N} .fhw-stop-text{margin:0;font-family:var(--font-body);font-size:clamp(15px,2.4vh,17px);line-height:1.5;color:var(--text-secondary);max-width:32ch;text-wrap:pretty}
${N} .fhw-open{display:inline-flex;align-items:center;gap:8px;${ITALIC};font-size:18px;color:var(--text-link);text-decoration:none}
${N} .fhw-open:hover{color:var(--fill-primary-pressed)}
${N} .fhw-open span{font-family:var(--font-symbol);font-style:normal}
${N} .fhw-pill{${BARE};margin-bottom:clamp(4px,1.6vh,14px);display:flex;align-items:center;gap:10px;padding:10px 18px 10px 14px;border:1px solid color-mix(in srgb,var(--fill-primary) 16%,transparent);outline:1px solid var(--symbol-line-soft);outline-offset:3px;border-radius:var(--radius-pill);background:var(--gradient-nightshade);box-shadow:var(--shadow-float);transition:transform 420ms var(--ease),box-shadow 420ms var(--ease),background 420ms var(--ease)}
${N} .fhw-pill[data-flash="true"]{background:var(--gradient-violet);transform:scale(1.06);box-shadow:0 0 0 7px color-mix(in srgb,var(--fill-primary) 22%,transparent),0 0 0 14px color-mix(in srgb,var(--fill-primary) 8%,transparent),var(--aura-violet)}
${N} .fhw-pill span:first-child{font-family:var(--font-symbol);font-size:13px;line-height:1;color:var(--fh-rose-300)}
${N} .fhw-pill span:last-child{${LABEL};color:var(--text-on-fill);letter-spacing:.22em;line-height:1;white-space:nowrap}
${N} .fhw-step{${BARE};margin-top:clamp(4px,2vh,18px);display:flex;align-items:center;gap:14px;max-width:100%}
${N} .fhw-step-btn{width:44px;height:44px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--gradient-vellum);box-shadow:${RING};${DISPLAY};font-size:28px;line-height:1;padding-bottom:3px;color:var(--symbol-ink)}
${N} .fhw-step:hover .fhw-step-btn{background:var(--fh-rose-100)}
${N} .fhw-step-copy{display:flex;flex-direction:column;gap:2px;min-width:0;text-align:left}
${N} .fhw-step-k{${LABEL};font-size:10px;color:var(--text-muted)}
${N} .fhw-step-v{${ITALIC};font-size:17px;line-height:1.25;color:var(--text-secondary)}

/* THE FACTS: date, sun, season and moon for the day under the needle. */
${N} .fhw-read{grid-area:read;justify-self:stretch;display:flex;flex-direction:column;align-items:flex-start;gap:clamp(6px,2vh,18px);min-width:0}
${N} .fhw-fact{display:flex;flex-direction:column;gap:4px}
${N} .fhw-fact-v{${DISPLAY};font-size:clamp(18px,3.2vh,24px);line-height:1.1;color:var(--text-witch)}

/* THE WHEEL */
${N} .fhw-wrap{grid-area:wheel;justify-self:center;position:relative;padding-top:6px}
${N} .fhw-face{position:relative;width:min(calc(100vw - 40px),70vh);aspect-ratio:1/1;touch-action:none;cursor:grab;user-select:none}
${N} .fhw-face[data-grab="true"]{cursor:grabbing}
${N} .fhw-disc{position:absolute;inset:0;border-radius:50%;background:var(--wash-moon),var(--texture-fibre),var(--gradient-vellum);box-shadow:var(--shadow-float),0 0 0 1px var(--symbol-line-soft)}
${N} .fhw-stars{position:absolute;inset:0;border-radius:50%;overflow:hidden;opacity:.7}
${N} .fhw-stars div{position:absolute;inset:-10%;background:var(--texture-stars);background-size:var(--texture-stars-size)}
${N} .fhw-rotor{position:absolute;inset:0;will-change:transform}
${N} .fhw-svg{position:absolute;inset:0;overflow:visible}
${N} .fhw-under,${N} .fhw-over,${N} .fhw-frame{pointer-events:none}
${N} .fhw-frame{position:absolute;inset:0}
${N} .fhw-center{position:absolute;left:50%;top:50%;width:40%;height:40%;transform:translate(-50%,-50%);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4cqw;pointer-events:none;container-type:inline-size}
${N} .fhw-moon{display:flex}
${N} .fhw-moon svg{width:37.5cqw;height:auto}
${N} .fhw-center-date{${ITALIC};font-size:clamp(13px,7cqw,24px);line-height:1;color:var(--text-witch);white-space:nowrap}
${N} .fhw-click{cursor:pointer}
${N} .yw-hit{fill:transparent;transition:fill 300ms}
${N} .yw-hit:hover{fill:color-mix(in srgb,var(--fill-primary) 10%,transparent)}
${N} .fhw-season{cursor:pointer;opacity:.2;transition:opacity 600ms}
${N} .fhw-month-name{${ITALIC};font-size:2.1px;fill:var(--text-secondary);pointer-events:none}
${N} .fhw-sign-glyph{font-family:var(--font-symbol);font-size:4.6px;fill:var(--symbol-ink)}
${N} .fhw-sign-name{${DISPLAY};font-size:1.75px;letter-spacing:.12px;fill:var(--text-muted);pointer-events:none}
${N} .fhw-season-name{${DISPLAY};font-size:1.9px;letter-spacing:.9px;pointer-events:none}
${N} .fhw-retro-arc{stroke:var(--fill-secondary);stroke-width:.7;stroke-linecap:round;opacity:.75}
${N} .fhw-m-card{fill:var(--surface-card);stroke-width:.22}
${N} .fhw-m-star{font-family:var(--font-symbol);font-size:2px;fill:var(--symbol-ink)}
${N} .fhw-ring{fill:none;stroke:var(--fill-primary);stroke-width:.4}
${N} .fhw-ring[data-hover="true"]{fill:color-mix(in srgb,var(--fill-primary) 10%,transparent);stroke-width:.25;stroke-dasharray:.6 .5}

/* THE THREAD: months, signs and seasons laid flat, the stops as dots, the marker for the day under the needle. */
${N} .fhw-thread{position:relative;z-index:1;width:100%;max-width:1320px;margin:0 auto;padding:30px 20px clamp(70px,8vw,110px);display:flex;flex-direction:column;gap:10px}
${N} .fhw-thread-bar{position:relative;height:72px;margin:0 10px}
${N} .fhw-t-month{${BARE};position:absolute;top:0;padding-left:7px;border-left:1px solid var(--symbol-line-soft);height:18px;line-height:18px;${ITALIC};font-size:13.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;max-width:8.333%}
${N} .fhw-t-month[data-on="true"]{color:var(--text-witch)}
${N} .fhw-t-sign{${BARE};position:absolute;top:22px;height:16px;padding-left:7px;border-left:1px solid var(--symbol-line);border-radius:0 8px 8px 0;background:transparent;${DISPLAY};font-size:12px;line-height:16px;color:var(--text-secondary);overflow:hidden;white-space:nowrap;transition:background 400ms}
${N} .fhw-t-sign[data-on="true"]{background:var(--fh-rose-100);color:var(--text-witch)}
${N} .fhw-t-season{position:absolute;top:42px;height:10px;border-radius:var(--radius-pill);background:var(--fhw-fill);padding-left:10px;display:flex;align-items:center;font-family:var(--font-display);font-size:8px;letter-spacing:.2em;text-transform:uppercase;overflow:hidden;white-space:nowrap;transition:background 500ms}
${N} .fhw-t-rule{position:absolute;left:0;right:0;top:62px;height:1px;background:var(--symbol-line)}
${N} .fhw-t-progress{position:absolute;left:0;top:61px;height:3px;width:0;border-radius:2px;background:var(--gradient-violet)}
${N} .fhw-t-dot{${BARE};position:absolute;top:62px;transform:translate(-50%,-50%);width:14px;height:30px;display:flex;align-items:center;justify-content:center;transition:transform 250ms var(--ease)}
${N} .fhw-t-dot[data-hover="true"]{transform:translate(-50%,-50%) scale(1.5)}
${N} .fhw-marker{position:absolute;top:-36px;bottom:-10px;left:0;width:0;pointer-events:none;z-index:4}
${N} .fhw-marker-date{position:absolute;top:0;left:0;transform:translateX(-50%);padding:5px 12px;border-radius:var(--radius-pill);background:var(--gradient-violet);color:var(--text-on-fill);${ITALIC};font-size:16px;line-height:1;white-space:nowrap;box-shadow:var(--aura-violet)}
${N} .fhw-marker-line{position:absolute;top:26px;bottom:0;left:-1px;width:2px;background:linear-gradient(180deg,var(--fh-clay-500),color-mix(in srgb,var(--fill-primary) 55%,transparent));box-shadow:0 0 12px color-mix(in srgb,var(--fill-primary) 45%,transparent)}
${N} .fhw-marker-dot{position:absolute;top:98px;left:0;width:12px;height:12px;transform:translate(-50%,-50%);border-radius:50%;background:var(--gradient-violet);box-shadow:0 0 0 3px var(--fh-cream-50),0 0 0 4.5px var(--symbol-ink),var(--aura-violet)}
${N} .fhw-tip{position:absolute;bottom:22px;z-index:5;width:250px;padding:14px 16px;border-radius:var(--radius-md);border:1px solid var(--symbol-line-soft);background:var(--texture-fibre),var(--gradient-vellum);box-shadow:var(--shadow-float);display:flex;flex-direction:column;gap:5px;pointer-events:none}
${N} .fhw-tip-title{${DISPLAY};font-size:21px;line-height:1.15;color:var(--text-witch)}
${N} .fhw-tip-ctx{${ITALIC};font-size:15px;line-height:1.35;color:var(--text-secondary)}
${N} .fhw-tip-also{${ITALIC};font-size:15px;line-height:1.35;color:var(--text-muted)}

/* THE LEGEND: each layer's mark, a switch. */
${N} .fhw-layers{display:flex;justify-content:center;gap:4px 22px;flex-wrap:wrap;align-items:center;padding-top:8px;background:linear-gradient(90deg,transparent,var(--border-hairline),transparent) top/100% 1px no-repeat;font-size:14px;zoom:.85}
${N} .fhw-layer{${BARE};display:flex;align-items:center;gap:8px;${ITALIC};font-size:17px;color:var(--text-secondary)}
${N} .fhw-layer[aria-pressed="false"]{color:var(--text-muted);opacity:.55;text-decoration:line-through;text-decoration-thickness:1px}
${N} .fhw-dot{--fhw-dot:9px;display:inline-block;width:var(--fhw-dot);height:var(--fhw-dot);border-radius:50%;flex:none;transition:opacity 200ms}
${N} .fhw-t-dot[data-act="true"] .fhw-dot{opacity:0}
${N} .fhw-dot[data-kind="ingress"]{width:calc(var(--fhw-dot) - 2px);height:calc(var(--fhw-dot) - 2px);background:var(--symbol-ink)}
${N} .fhw-dot[data-kind="season"],${N} .fhw-dot[data-kind="festival"]{width:auto;height:auto;border-radius:0;font-family:var(--font-symbol);font-size:calc(var(--fhw-dot) + 4px);line-height:1;color:var(--symbol-ink)}
${N} .fhw-dot[data-kind="gathering"]{width:calc(var(--fhw-dot) + 1px);height:calc(var(--fhw-dot) + 1px);background:var(--gradient-violet);box-shadow:0 0 0 2px var(--surface-card),0 0 0 2.8px var(--fill-secondary)}
${N} .fhw-dot[data-kind="full"]{background:var(--fh-cream-50);box-shadow:0 0 0 1.2px var(--symbol-ink)}
${N} .fhw-dot[data-kind="new"]{background:var(--fh-night-800)}
${N} .fhw-dot[data-kind="eclipse"]{background:var(--fill-secondary);box-shadow:0 0 0 2px var(--fh-cream-50),0 0 0 2.8px var(--fill-secondary)}
${N} .fhw-dot[data-kind="retro"],${N} .fhw-dot[data-kind="direct"]{width:calc(var(--fhw-dot) + 5px);height:3px;border-radius:2px;background:var(--fill-secondary)}

@media (min-width:860px){
  ${N} .fhw-hero{height:calc(100vh - 70px - var(--fhw-stick));min-height:420px;gap:12px;padding:22px 40px 8px;overflow:hidden}
  ${N} .fhw-main{flex:1;min-height:0;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:none;align-items:center;gap:clamp(20px,3.5vw,64px)}
  ${N} .fhw-panel,${N} .fhw-read,${N} .fhw-wrap{grid-area:auto}
  ${N} .fhw-face{width:clamp(280px,min(calc(100vh - 96px - var(--fhw-stick) - var(--fhw-head)),calc(100vw - 560px)),1100px)}
  ${N} .fhw-thread{padding:30px 40px clamp(70px,8vw,110px)}
}
@media (prefers-reduced-motion:reduce){
  ${N} .fhw *{transition:none!important}
}
`
