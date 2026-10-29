import { FREE_HUMAN_TOKENS_CSS, FREE_HUMAN_VARIANTS_CSS } from '@/lib/theme/free-human'
import { FREE_HUMAN_CHROME_CSS } from '@/components/sites/free-human-chrome-css'
import { FREE_HUMAN_BLOCKS_CSS } from '@/components/sites/free-human-blocks-css'

// THE FREE HUMAN KIT SKIN, FOUNDATION LAYER. Scoped under [data-house-theme="free-human"], so it can only ever dress the
// stand-alone site render (components/sites/site-chrome.tsx sets that attribute on the site root, and nothing in a
// member, Space console or admin area does: app/(main)/no-site-theme-in-member-area.test.ts guards it). Every value
// reads the token block (lib/theme/free-human.ts); no raw colour or size lives here.
//
// This layer holds the ground and the type primitives, then the design's own utility classes (tokens/effects.css,
// textures.css, typography.css) renamed .fhm-* to .fh-*: the four registers (lazure, gold, sanctuary, sky), halo and
// rays, the gilt frame, the song line, flow edges, grain, the elemental textures and the wanderers. The header,
// footer and blocks are the next layers; the house sheets stay underneath until then.

const N = '[data-house-theme="free-human"]'
const EASE = 'var(--ease-soft)'

/** The design's class sheet, renamed and scoped. Generated from tokens/*.css (rules.json maps the token names). */
export const FREE_HUMAN_CLASSES_CSS = `
@keyframes fh-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
@keyframes fh-sway{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-6px) rotate(1.2deg)}}
@keyframes fh-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes fh-turn{to{transform:rotate(360deg)}}
@keyframes fh-flicker{0%,100%{opacity:1}45%{opacity:.86}60%{opacity:.95}}
[data-house-theme="free-human"] .fh-breathe{animation:fh-breathe var(--dur-breath) var(--ease-tide) infinite}
[data-house-theme="free-human"] .fh-sway{animation:fh-sway calc(var(--dur-breath) * 1.4) var(--ease-tide) infinite}
[data-house-theme="free-human"] .fh-rise{animation:fh-rise var(--dur-slow) var(--ease-soft) both}
[data-house-theme="free-human"] .fh-turn{animation:fh-turn 120s linear infinite}
[data-house-theme="free-human"] .fh-flicker{animation:fh-flicker 3.2s var(--ease-tide) infinite}
@keyframes fh-wander-a{0%,100%{transform:translate(0,0)}20%{transform:translate(70px,-50px)}45%{transform:translate(130px,20px)}70%{transform:translate(40px,90px)}85%{transform:translate(-50px,30px)}}
@keyframes fh-wander-b{0%,100%{transform:translate(0,0)}25%{transform:translate(-90px,-30px)}50%{transform:translate(-40px,-110px)}75%{transform:translate(60px,-60px)}}
@keyframes fh-wander-c{0%,100%{transform:translate(0,0)}30%{transform:translate(50px,70px)}60%{transform:translate(-70px,110px)}80%{transform:translate(-100px,10px)}}
@keyframes fh-twinkle{0%,100%{opacity:.25}50%{opacity:1}}
@keyframes fh-petal-drift{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:.75}50%{transform:translate(-160px,180px) rotate(200deg)}92%{opacity:.75}100%{transform:translate(-60px,380px) rotate(380deg);opacity:0}}
@keyframes fh-orb-drift{0%{transform:translate(0,0) scale(1)}50%{transform:translate(12%,-8%) scale(1.12)}100%{transform:translate(-10%,10%) scale(.94)}}
@keyframes fh-grain-shift{0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}60%{transform:translate(-2%,-1%)}80%{transform:translate(3%,1%)}100%{transform:translate(0,0)}}
@media (prefers-reduced-motion:reduce){[data-house-theme="free-human"] .fh-breathe,[data-house-theme="free-human"] .fh-sway,[data-house-theme="free-human"] .fh-rise,[data-house-theme="free-human"] .fh-turn,[data-house-theme="free-human"] .fh-flicker,[data-house-theme="free-human"] .fh-mote,[data-house-theme="free-human"] .fh-petal,[data-house-theme="free-human"] .fh-orb,[data-house-theme="free-human"] .fh-paper::before{animation:none}}
[data-house-theme="free-human"] .fh-grain{position:relative;isolation:isolate}
[data-house-theme="free-human"] .fh-grain::after{content:"";position:absolute;inset:0;background-image:var(--texture-grain);mix-blend-mode:multiply;opacity:.6;pointer-events:none;border-radius:inherit;z-index:1}
[data-house-theme="free-human"] .fh-lazure{background:var(--wash-lazure),var(--surface-page)}
[data-house-theme="free-human"] .fh-sanctuary{background:var(--wash-candle),var(--surface-deep);color:var(--text-on-inverse)}
/* token-ok: the design's own colour in tokens/textures.css, effects.css */
[data-house-theme="free-human"] .fh-sky{background:var(--pattern-stars),radial-gradient(90% 70% at 50% 0%,rgba(31,74,168,.55),transparent 70%),var(--surface-lapis);background-size:220px 220px,220px 220px,220px 220px,220px 220px,220px 220px,220px 220px,100% 100%,auto;background-repeat:repeat,repeat,repeat,repeat,repeat,repeat,no-repeat,no-repeat;color:var(--text-on-inverse)}
[data-house-theme="free-human"] .fh-halo{border-radius:50%;background:var(--wash-halo)}
[data-house-theme="free-human"] .fh-rays{border-radius:50%;background:var(--pattern-rays);-webkit-mask:radial-gradient(closest-side,transparent 34%,black 36%,black 62%,transparent 100%);mask:radial-gradient(closest-side,transparent 34%,black 36%,black 62%,transparent 100%)}
[data-house-theme="free-human"] .fh-tessera{background-image:var(--pattern-tessera),linear-gradient(135deg,var(--fh-saffron-300),var(--fh-saffron-400) 50%,var(--fh-brass-600));background-size:9px 9px,9px 9px,auto}
[data-house-theme="free-human"] .fh-gilt{box-shadow:var(--frame-gilt)}
[data-house-theme="free-human"] .fh-gilt-dark{box-shadow:var(--frame-gilt-dark)}
[data-house-theme="free-human"] .fh-wave-band{color:var(--fh-clay-500);background:currentColor;-webkit-mask:var(--pattern-wave) repeat-x center/64px 20px;mask:var(--pattern-wave) repeat-x center/64px 20px;height:20px}
[data-house-theme="free-human"] .fh-scallop{color:var(--fh-rose-200);height:16px;background:radial-gradient(circle at 50% 0,currentColor 13px,transparent 13.5px) 0 0/30px 16px repeat-x}
[data-house-theme="free-human"] .fh-flute{background-image:var(--pattern-flute)}
[data-house-theme="free-human"] .fh-moon{border-radius:50%;-webkit-mask:radial-gradient(circle at 68% 38%,transparent 40%,black 41%);mask:radial-gradient(circle at 68% 38%,transparent 40%,black 41%)}
[data-house-theme="free-human"] .fh-kilim-band{color:var(--fh-clay-500);background-image:var(--pattern-kilim);background-size:22px 22px;height:22px}
[data-house-theme="free-human"] .fh-photo{position:relative;overflow:hidden}
[data-house-theme="free-human"] .fh-photo>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
[data-house-theme="free-human"] .fh-flow-b,[data-house-theme="free-human"] .fh-flow-t,[data-house-theme="free-human"] .fh-flow{position:relative;z-index:1}
[data-house-theme="free-human"] .fh-flow-b{-webkit-mask:linear-gradient(black 0 0) top/100% calc(100% - 47px) no-repeat,var(--edge-wave-bottom) bottom/max(1200px,100%) 48px no-repeat;mask:linear-gradient(black 0 0) top/100% calc(100% - 47px) no-repeat,var(--edge-wave-bottom) bottom/max(1200px,100%) 48px no-repeat;margin-bottom:-47px}
[data-house-theme="free-human"] .fh-flow-t{-webkit-mask:var(--edge-wave-top) top/max(1200px,100%) 48px no-repeat,linear-gradient(black 0 0) bottom/100% calc(100% - 47px) no-repeat;mask:var(--edge-wave-top) top/max(1200px,100%) 48px no-repeat,linear-gradient(black 0 0) bottom/100% calc(100% - 47px) no-repeat;margin-top:-47px}
[data-house-theme="free-human"] .fh-flow{-webkit-mask:var(--edge-wave-top) top/max(1200px,100%) 48px no-repeat,linear-gradient(black 0 0) center/100% calc(100% - 94px) no-repeat,var(--edge-wave-bottom) bottom/max(1200px,100%) 48px no-repeat;mask:var(--edge-wave-top) top/max(1200px,100%) 48px no-repeat,linear-gradient(black 0 0) center/100% calc(100% - 94px) no-repeat,var(--edge-wave-bottom) bottom/max(1200px,100%) 48px no-repeat;margin:-47px 0}
[data-house-theme="free-human"] .fh-feather{-webkit-mask:radial-gradient(closest-side,black 72%,transparent);mask:radial-gradient(closest-side,black 72%,transparent)}
[data-house-theme="free-human"] .fh-paper{position:relative;background-image:var(--texture-fiber),var(--texture-grain);background-size:320px 320px,160px 160px;background-attachment:fixed}
[data-house-theme="free-human"] .fh-limewash{position:relative;isolation:isolate}
[data-house-theme="free-human"] .fh-limewash::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:var(--texture-limewash),var(--texture-fiber);background-size:600px 600px,320px 320px;mix-blend-mode:multiply;opacity:.8;border-radius:inherit}
[data-house-theme="free-human"] .fh-paper-gold{position:relative;isolation:isolate}
[data-house-theme="free-human"] .fh-paper-gold::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:var(--texture-fiber),var(--texture-limewash);background-size:240px 240px,900px 900px;mix-blend-mode:multiply;opacity:.55}
[data-house-theme="free-human"] .fh-sanctuary,[data-house-theme="free-human"] .fh-sky{position:relative;isolation:isolate}
[data-house-theme="free-human"] .fh-sanctuary::before,[data-house-theme="free-human"] .fh-sky::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:var(--texture-glint),var(--texture-limewash);background-size:180px 180px,700px 700px;opacity:.28;mix-blend-mode:screen}
[data-house-theme="free-human"] .fh-sanctuary{box-shadow:var(--vignette-deep)}
[data-house-theme="free-human"] .fh-sky{box-shadow:var(--vignette-deep)}
[data-house-theme="free-human"] .fh-photo::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background-image:var(--texture-grain);mix-blend-mode:multiply;opacity:.45;border-radius:inherit}
[data-house-theme="free-human"] .fh-wander{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}
/* token-ok: the design's own colour in tokens/textures.css, effects.css */
[data-house-theme="free-human"] .fh-mote{position:absolute;left:var(--x,50%);top:var(--y,50%);width:var(--s,5px);height:var(--s,5px);border-radius:50%;background:radial-gradient(circle,var(--fh-saffron-100),var(--fh-saffron-400) 60%,transparent 72%);box-shadow:0 0 calc(var(--s,5px) * 2.4) rgba(245,196,81,.55);animation:fh-wander-a var(--d,60s) var(--ease-tide) infinite,fh-twinkle calc(var(--d,60s) / 9) ease-in-out infinite;animation-delay:var(--delay,0s)}
[data-house-theme="free-human"] .fh-mote.b{animation-name:fh-wander-b,fh-twinkle}
[data-house-theme="free-human"] .fh-mote.c{animation-name:fh-wander-c,fh-twinkle}
/* token-ok: the design's own colour in tokens/textures.css, effects.css */
[data-house-theme="free-human"] .fh-petal{position:absolute;left:var(--x,50%);top:var(--y,50%);width:var(--s,12px);height:calc(var(--s,12px) * .72);border-radius:var(--fh-radius-petal);background:linear-gradient(135deg,var(--fh-rose-200),var(--fh-rose-300));opacity:.75;box-shadow:0 2px 6px rgba(200,96,74,.18);animation:fh-petal-drift var(--d,70s) var(--ease-tide) infinite;animation-delay:var(--delay,0s)}
/* token-ok: the design's own colour in tokens/textures.css, effects.css */
[data-house-theme="free-human"] .fh-orb{position:absolute;left:var(--x,50%);top:var(--y,50%);width:var(--s,360px);aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,var(--c,rgba(245,196,81,.35)),transparent);filter:blur(8px);animation:fh-orb-drift var(--d,110s) var(--ease-tide) infinite alternate;animation-delay:var(--delay,0s)}
[data-house-theme="free-human"] .fh-tex-plant,[data-house-theme="free-human"] .fh-tex-earth,[data-house-theme="free-human"] .fh-tex-water,[data-house-theme="free-human"] .fh-tex-fire,[data-house-theme="free-human"] .fh-tex-wind{background-size:400px 400px;background-repeat:repeat}
[data-house-theme="free-human"] .fh-tex-plant{background-image:var(--texture-plant)}
[data-house-theme="free-human"] .fh-tex-earth{background-image:var(--texture-earth)}
[data-house-theme="free-human"] .fh-tex-water{background-image:var(--texture-water)}
[data-house-theme="free-human"] .fh-tex-fire{background-image:var(--texture-fire)}
[data-house-theme="free-human"] .fh-tex-wind{background-image:var(--texture-wind)}
[data-house-theme="free-human"] .fh-tex-plant-light,[data-house-theme="free-human"] .fh-tex-earth-light,[data-house-theme="free-human"] .fh-tex-water-light,[data-house-theme="free-human"] .fh-tex-fire-light,[data-house-theme="free-human"] .fh-tex-wind-light{background-size:400px 400px;background-repeat:repeat}
[data-house-theme="free-human"] .fh-tex-plant-light{background-image:var(--texture-plant-light)}
[data-house-theme="free-human"] .fh-tex-earth-light{background-image:var(--texture-earth-light)}
[data-house-theme="free-human"] .fh-tex-water-light{background-image:var(--texture-water-light)}
[data-house-theme="free-human"] .fh-tex-fire-light{background-image:var(--texture-fire-light)}
[data-house-theme="free-human"] .fh-tex-wind-light{background-image:var(--texture-wind-light)}
[data-house-theme="free-human"] .fh-display{font-family:var(--font-display);font-size:var(--text-display-l);line-height:var(--leading-tight);letter-spacing:var(--tracking-display);color:var(--text-strong);font-weight:500;text-wrap:balance}
[data-house-theme="free-human"] .fh-display em,[data-house-theme="free-human"] .fh-h1 em,[data-house-theme="free-human"] .fh-h2 em{font-style:italic;font-weight:400;color:var(--text-lyric)}
[data-house-theme="free-human"] .fh-sanctuary .fh-display em,[data-house-theme="free-human"] .fh-sanctuary .fh-h1 em,[data-house-theme="free-human"] .fh-sanctuary .fh-h2 em,[data-house-theme="free-human"] .fh-sky .fh-display em,[data-house-theme="free-human"] .fh-sky .fh-h1 em,[data-house-theme="free-human"] .fh-sky .fh-h2 em,[data-house-theme="free-human"] .fh-sanctuary .fh-lyric,[data-house-theme="free-human"] .fh-sky .fh-lyric{color:var(--text-gilt)}
[data-house-theme="free-human"] .fh-sanctuary .fh-eyebrow,[data-house-theme="free-human"] .fh-sky .fh-eyebrow{color:var(--text-gilt)}
[data-house-theme="free-human"] .fh-h1{font-family:var(--font-display);font-size:var(--text-h1);line-height:var(--leading-snug);letter-spacing:var(--tracking-display);color:var(--text-strong);font-weight:500;text-wrap:balance}
[data-house-theme="free-human"] .fh-h2{font-family:var(--font-display);font-size:var(--text-h2);line-height:var(--leading-snug);color:var(--text-strong);font-weight:500;text-wrap:balance}
[data-house-theme="free-human"] .fh-h3{font-family:var(--font-body);font-size:var(--text-h3);line-height:1.28;font-weight:600;color:var(--text-strong)}
[data-house-theme="free-human"] .fh-lyric{font-family:var(--font-lyric);font-style:italic;font-size:var(--text-lyric-size);line-height:var(--leading-lyric);font-weight:400;color:var(--text-lyric);text-wrap:pretty}
[data-house-theme="free-human"] .fh-eyebrow{font-family:var(--font-inscription);font-size:var(--text-eyebrow);letter-spacing:var(--tracking-eyebrow);text-transform:uppercase;color:var(--text-accent)}
[data-house-theme="free-human"] .fh-body{font-family:var(--font-body);font-size:var(--text-body);line-height:var(--leading-body);color:var(--fh-umber-800);text-wrap:pretty}
[data-house-theme="free-human"] .fh-caption{font-family:var(--font-body);font-size:var(--text-caption);line-height:1.45;color:var(--text-muted)}
`

export const FREE_HUMAN_CSS = `${FREE_HUMAN_TOKENS_CSS}${FREE_HUMAN_VARIANTS_CSS}${N}{background-color:var(--color-canvas);background-image:var(--texture-fiber),var(--texture-grain);background-size:320px 320px,160px 160px;background-attachment:fixed;color:var(--color-text);font-family:var(--font-body);line-height:var(--leading-body)}
${N} .hs-root{background:transparent;color:var(--color-text)}
${N} h1,${N} h2,${N} h3,${N} .hs-h2,${N} .hs-brand{font-family:var(--font-display);font-weight:var(--weight-display);line-height:var(--leading-snug);letter-spacing:var(--tracking-display);text-wrap:balance}
${N} h4,${N} h5,${N} h6{font-family:var(--font-body);font-weight:var(--weight-semibold);line-height:1.28}
${N} .hs-h1{font-family:var(--font-display);font-weight:var(--weight-display);line-height:var(--leading-tight);letter-spacing:var(--tracking-display);text-wrap:balance}
${N} .hs-h1 em,${N} .hs-h2 em{font-style:italic;font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} strong,${N} b{font-weight:var(--weight-semibold)}
${N} p,${N} li,${N} figcaption{text-wrap:pretty}
${N} .hs-lead{font-size:var(--text-lead);line-height:var(--leading-relaxed)}
${N} .hs-eyebrow,${N} .hs-label,${N} .hs-badge{font-family:var(--font-inscription);font-size:var(--text-eyebrow);font-weight:var(--weight-regular);text-transform:uppercase;letter-spacing:var(--tracking-eyebrow)}
${N} blockquote{font-family:var(--font-lyric);font-style:italic;font-weight:var(--weight-regular);font-size:var(--text-quote);line-height:var(--leading-lyric);color:var(--text-lyric)}
${N} a{color:var(--text-accent);text-decoration:none;transition:color var(--motion-fast) ${EASE}}
${N} a:hover{color:var(--fh-clay-500)}
${N} .hs-btn,${N} .hs-btn-primary,${N} .hs-btn-dark{font-family:var(--font-body);font-weight:var(--weight-medium);border-radius:var(--fh-radius-pill);transition:background-color var(--motion-fast) ${EASE},box-shadow var(--motion-fast) ${EASE},transform var(--motion-fast) ${EASE}}
${N} .hs-btn-primary,${N} .hs-btn-dark{background:var(--mn-solid);color:var(--mn-on-solid);border:1px solid var(--mn-solid);box-shadow:var(--shadow-button)}
${N} .hs-btn-primary:hover,${N} .hs-btn-dark:hover{background:var(--mn-solid-hover);border-color:var(--mn-solid-hover);color:var(--mn-on-solid)}
${N} .hs-btn:active{transform:scale(var(--press-scale))}
${N} :focus-visible{outline:none;box-shadow:var(--ring-focus)}
${N} ::selection{background:var(--color-selection);color:var(--fh-ink-900)}
${FREE_HUMAN_CLASSES_CSS}
${FREE_HUMAN_CHROME_CSS}
${FREE_HUMAN_BLOCKS_CSS}
@media (prefers-reduced-motion:reduce){${N},${N} *{--motion-instant:0ms;--motion-fast:0ms;--motion-base:0ms;--motion-slow:0ms;--motion-veil:0ms;animation-duration:.01ms!important;transition-duration:.01ms!important}}
`
