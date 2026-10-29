// THE FREE HUMAN BLOCKS SKIN (design: templates/website/Website.dc.html, the Home's eight sections). Scoped under
// [data-house-theme="free-human"], so it can only ever dress the stand-alone site render (components/sites/site-chrome.tsx sets that
// attribute; nothing in a member, Space console or admin area does: app/(main)/no-site-theme-in-member-area.test.ts guards it). The
// design draws these sections with inline styles; here each is a class, every colour, wash and shadow reads the token block
// (lib/theme/free-human.ts), and the sizes are the design's own. It layers after the foundation (free-human-css.ts).

const N = '[data-house-theme="free-human"]'
/** The design's rows are 1180 of content inside a gutter, so a border-box row is the 1180 plus both gutters. */
const ROW = 'calc(1180px + 2 * clamp(16px,3vw,32px))'
const GUTTER = 'clamp(16px,3vw,32px)'
const DISPLAY = 'font-family:var(--font-display);font-weight:var(--weight-medium)'
const INSCRIPTION = 'font-family:var(--font-inscription);text-transform:uppercase'
const LYRIC = 'font-family:var(--font-lyric);font-style:italic'

export const FREE_HUMAN_BLOCKS_CSS = `
/* THE GROUNDS: a section is one of five registers (day, gold, night, sunset, sky), meets its neighbours with a wave or a straight edge,
   and may carry one elemental texture and a wandering layer. The registers' own washes are the foundation's (.fh-lazure, .fh-sanctuary,
   .fh-sky, .fh-paper-gold); these two are the design's gold and sunset fills. */
${N} .fh-sec{position:relative;isolation:isolate;overflow:hidden}
${N} .fh-g-gold{background:radial-gradient(70% 90% at 50% 50%,var(--fh-saffron-100),var(--fh-peach-100));box-shadow:var(--vignette-soft)}
${N} .fh-g-sunset{background:var(--wash-sunset),var(--fh-peach-100)}
${N} .fh-ground-tex{position:absolute;inset:0;pointer-events:none;z-index:0}
${N} .fh-ground-tex[data-tex="earth"]{-webkit-mask:linear-gradient(transparent,black 25%,black 75%,transparent);mask:linear-gradient(transparent,black 25%,black 75%,transparent)}
${N} .fh-ground-tex[data-tex="wind"]{mix-blend-mode:multiply}
${N} .fh-row{position:relative;z-index:2;box-sizing:border-box;max-width:${ROW};margin:0 auto;padding:var(--fh-pad-top,clamp(90px,11.8vw,150px)) ${GUTTER} var(--fh-pad-bottom,clamp(100px,13.4vw,170px))}

/* THE SECTION HEAD: the inscription, the title with its lyric italic, an optional aside. */
${N} .fh-eyebrow{${INSCRIPTION};font-size:13px;letter-spacing:.2em;color:var(--text-accent)}
${N} .fh-sec-title{margin:0;${DISPLAY};font-size:clamp(40px,4.6vw,60px);line-height:1.08;color:var(--text-strong);text-wrap:balance}
${N} .fh-sec-title em,${N} .fh-hero-title em,${N} .fh-speak-name em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fh-head{display:flex;flex-direction:column;gap:14px}
${N} .fh-head--center{align-items:center;text-align:center;margin:0 auto;gap:16px}
${N} .fh-head--split{flex-direction:row;justify-content:space-between;align-items:flex-end;gap:32px;flex-wrap:wrap}
${N} .fh-head-copy{display:flex;flex-direction:column;gap:14px;max-width:620px}
${N} .fh-aside{margin:0;max-width:380px;${LYRIC};font-size:22px;line-height:1.35;color:var(--text-lyric)}
${N} .fh-lead{margin:0;max-width:540px;font-size:18px;line-height:1.65}
${N} :where(.fh-sec) h3{margin:0}
${N} :where(.fh-sec) p{color:var(--text-body-ink)}

/* THE BADGE (design: components/core/Badge.jsx): a pill in the italic display face. */
${N} .fh-badge{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 14px 1px;border-radius:var(--fh-radius-pill);background:var(--fh-rose-100);color:var(--fh-clay-700);font-family:var(--font-display);font-style:italic;font-weight:var(--weight-medium);font-size:16px;line-height:1;white-space:nowrap}
${N} .fh-badge[data-tone="saffron"]{background:var(--fh-saffron-100);color:var(--fh-gold-700)}
${N} .fh-badge[data-tone="sage"]{background:var(--fh-sage-100);color:var(--fh-jade-700)}
${N} .fh-badge[data-tone="gilt"]{background:linear-gradient(180deg,var(--fh-saffron-300),var(--fh-saffron-400));color:var(--fh-ink-900)}
${N} .fh-badge-dot{width:7px;height:7px;border-radius:50%;background:var(--fh-clay-500);box-shadow:0 0 0 3px color-mix(in srgb,var(--fh-clay-500) 22%,transparent)}

/* THE BLOCK BUTTONS: the chrome's pills, plus the deep one the night section's rows use and the quiet one that has no frame. */
${N} .hs-btn-deep{background:linear-gradient(180deg,var(--fh-umber-800),var(--fh-night-900));color:var(--fh-saffron-100);border:0;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fh-saffron-300) 35%,transparent)}
${N} .hs-btn-deep:hover{background:linear-gradient(180deg,color-mix(in srgb,var(--fh-umber-800) 88%,var(--fh-cream-50)),var(--fh-night-800));color:var(--fh-saffron-100)}
${N} .fh-actions{display:flex;gap:14px;flex-wrap:wrap;align-items:center}

/* A PICTURE FRAME (design: .fhm-photo, the arch, the egg, the pebble). The loading colour behind it is the picture's own average. */
${N} .fh-frame{position:relative;margin:8px;overflow:hidden}
${N} .fh-frame>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
${N} .fh-frame[data-shape="arch"]{border-radius:var(--radius-arch)}
${N} .fh-frame[data-shape="egg"]{border-radius:var(--fh-radius-egg)}
${N} .fh-frame[data-shape="pebble"]{border-radius:var(--fh-radius-pebble)}
${N} .fh-frame[data-shape="circle"]{border-radius:50%}
${N} .fh-frame[data-shape="soft"]{border-radius:var(--fh-radius-lg)}

/* HERO: the title, the lead and two buttons on the left; a painted arch with its honey egg, its sun and its pebble on the right. */
${N} .fh-hero .fh-row{--fh-pad-top:clamp(40px,5vw,64px);--fh-pad-bottom:clamp(90px,10vw,140px);display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:clamp(32px,4.4vw,56px);align-items:center}
${N} .fh-hero-copy{display:flex;flex-direction:column;align-items:flex-start;gap:26px}
${N} .fh-hero-title{margin:0;${DISPLAY};font-size:clamp(54px,6.8vw,100px);line-height:.98;letter-spacing:-.01em;color:var(--text-strong);text-wrap:balance}
${N} .fh-hero-lead{margin:0;max-width:500px;font-size:19px;line-height:1.65}
${N} .fh-hero-art{position:relative;height:620px}
${N} .fh-hero-art .fh-rays{position:absolute;left:6%;top:-70px;width:72%;aspect-ratio:1}
${N} .fh-hero-art .fh-halo{position:absolute;left:20%;top:0;width:44%;aspect-ratio:1}
${N} .fh-hero-main{position:absolute;left:14%;top:64px;width:56%;height:84%;margin:0}
${N} .fh-hero-egg{position:absolute;right:0;bottom:10px;width:34%;height:40%;margin:0;box-shadow:var(--fh-depth-2)}
${N} .fh-hero-sun{position:absolute;right:6%;top:40px;width:78px;height:78px;margin:0;box-shadow:var(--shadow-halo)}
${N} .fh-hero-pebble{position:absolute;left:0;bottom:46px;width:96px;height:84px;margin:0;box-shadow:var(--fh-depth-2)}

/* SEASONS: four arches, the second and fourth set lower, each with its elemental seal, its inscription and its italic name. */
${N} .fh-seasons-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(20px,3vw,44px);align-items:start;margin-top:72px}
${N} .fh-season{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;color:inherit}
${N} .fh-season:nth-child(even){margin-top:48px}
${N} .fh-season .fh-frame{width:calc(100% - 16px);aspect-ratio:3/4.4}
${N} .fh-seal{position:relative;z-index:2;width:58px;height:50px;margin-top:-34px;border-radius:var(--fh-radius-pebble);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px var(--fh-cream-100),var(--fh-depth-1)}
${N} .fh-season[data-season="winter"] .fh-seal{background-color:var(--fh-indigo-100);color:var(--fh-indigo-700)}
${N} .fh-season[data-season="spring"] .fh-seal{background-color:var(--fh-sage-100);color:var(--fh-jade-700)}
${N} .fh-season[data-season="summer"] .fh-seal{background-color:var(--fh-saffron-100);color:var(--fh-clay-700)}
${N} .fh-season[data-season="fall"] .fh-seal{background-color:var(--fh-peach-100);color:var(--fh-walnut-600)}
${N} .fh-season-tag{${INSCRIPTION};font-size:12px;letter-spacing:.2em;margin-top:8px}
${N} .fh-season[data-season="winter"] .fh-season-tag{color:var(--fh-indigo-500)}
${N} .fh-season[data-season="spring"] .fh-season-tag{color:var(--fh-jade-500)}
${N} .fh-season[data-season="summer"] .fh-season-tag{color:var(--fh-brass-600)}
${N} .fh-season[data-season="fall"] .fh-season-tag{color:var(--fh-clay-500)}
${N} .fh-season-name{${DISPLAY};font-style:italic;font-size:38px;line-height:1;color:var(--text-strong)}
${N} .fh-season p{margin:0;font-size:15px;line-height:1.6;max-width:220px}
${N} .fh-seasons-foot{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:64px;align-items:center}

/* LYRIC: the sun above one line, then the eight feelings in their round seals. */
${N} .fh-lyric-band .fh-row{--fh-pad-top:clamp(90px,11.8vw,150px);--fh-pad-bottom:clamp(90px,12.6vw,160px);max-width:calc(880px + 2 * ${GUTTER});display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center}
${N} .fh-lyric-sun{position:relative;width:96px;height:96px}
${N} .fh-lyric-sun .fh-rays{position:absolute;inset:0}
${N} .fh-lyric-sun .fh-halo{position:absolute;inset:22px}
${N} .fh-lyric-line{margin:0;${LYRIC};font-size:clamp(32px,3.8vw,50px);line-height:1.2;color:var(--text-lyric);text-wrap:pretty}
${N} .fh-feelings{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 26px;margin:10px 0 0;padding:0;list-style:none}
${N} .fh-feeling{display:flex;flex-direction:column;align-items:center;gap:8px;width:72px}
${N} .fh-feeling-seal{width:52px;height:52px;border-radius:50%;background:radial-gradient(circle,var(--fh-cream-50),color-mix(in srgb,var(--fh-cream-50) 40%,transparent));display:flex;align-items:center;justify-content:center;color:var(--fh-clay-700);box-shadow:0 8px 18px -12px color-mix(in srgb,var(--fh-clay-700) 45%,transparent)}
${N} .fh-feeling-label{font-family:var(--font-display);font-style:italic;font-size:16px;color:var(--text-body)}
${N} .fh-lyric-note{margin:0;font-size:17px;color:var(--text-soft)}
${N} .fh-lyric-band .fh-wave-band{width:180px;color:var(--fh-brass-600);opacity:.6}

/* WORKSHOPS: three columns of pictures in three shapes, set at three heights. */
${N} .fh-workshops .fh-row{--fh-pad-top:clamp(90px,13.4vw,170px);--fh-pad-bottom:clamp(100px,14.9vw,190px)}
${N} .fh-workshops .fh-head--split{margin-bottom:56px}
${N} .fh-workshop-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(28px,4vw,64px);align-items:start}
${N} .fh-workshop{display:flex;flex-direction:column;gap:14px}
${N} .fh-workshop:nth-child(2){margin-top:56px}
${N} .fh-workshop:nth-child(3){margin-top:20px}
${N} .fh-workshop .fh-frame{width:calc(100% - 16px);aspect-ratio:4/4.6}
${N} .fh-workshop .fh-frame[data-shape="circle"]{aspect-ratio:1}
${N} .fh-workshop-when{${INSCRIPTION};font-size:12px;letter-spacing:.2em;color:var(--text-accent);margin-top:12px}
${N} .fh-workshop-title{${DISPLAY};font-size:32px;line-height:1.08;color:var(--text-strong)}
${N} .fh-workshop-title em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fh-workshop p{margin:0;font-size:16px;line-height:1.65;max-width:320px}
${N} .fh-workshop .hs-btn{align-self:flex-start;margin-left:-14px}

/* EVENTS: a lantern arch beside a list of dated rows, each underlined with a thread of gold. */
${N} .fh-events .fh-row{--fh-pad-top:clamp(90px,13.4vw,170px);--fh-pad-bottom:clamp(100px,14.2vw,180px);display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(36px,5vw,72px);align-items:center}
${N} .fh-events-art{position:relative}
${N} .fh-events-art .fh-halo{position:absolute;left:10%;top:-6%;width:80%;aspect-ratio:1;opacity:.35}
${N} .fh-events-art .fh-frame{aspect-ratio:3/4.2}
${N} .fh-events-copy{display:flex;flex-direction:column;gap:14px}
${N} .fh-events .fh-eyebrow{color:var(--text-gilt)}
${N} .fh-events .fh-sec-title{margin:0 0 22px;color:var(--fh-cream-50)}
${N} .fh-events .fh-sec-title em{color:var(--text-gilt)}
${N} .fh-event{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:22px;align-items:center;padding:18px 0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--fh-saffron-300) 35%,transparent),transparent) bottom/100% 1px no-repeat}
${N} .fh-event:last-of-type{background:none}
${N} .fh-event-stamp{text-align:center}
${N} .fh-event-day{display:block;font-family:var(--font-display);font-style:italic;font-size:46px;line-height:.9;color:var(--fh-saffron-300)}
${N} .fh-event-month{display:block;${INSCRIPTION};font-size:11px;letter-spacing:.2em;color:var(--fh-cream-100);margin-top:4px}
${N} .fh-event-mark{display:flex;justify-content:center;color:var(--fh-saffron-300)}
${N} .fh-event-title{display:flex;align-items:center;gap:10px;${DISPLAY};font-size:26px;line-height:1.15;color:var(--fh-cream-50)}
${N} .fh-event-title .fh-glyph{flex:none;color:var(--fh-saffron-300)}
${N} .fh-event-meta{font-size:14px;color:var(--fh-cream-100);opacity:.75;margin-top:4px}
${N} .fh-events .hs-btn-secondary{background:transparent;color:var(--fh-cream-50);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fh-cream-50) 38%,transparent)}
${N} .fh-events .hs-btn-secondary:hover{background:color-mix(in srgb,var(--fh-cream-50) 12%,transparent)}
${N} .fh-events-empty{margin:0;font-size:17px;color:var(--fh-cream-100)}
${N} .fh-events-more{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-family:var(--font-display);font-style:italic;font-size:20px;color:var(--fh-saffron-300)}
${N} .fh-events-more:hover{color:var(--fh-saffron-100)}

/* BOOKS: two bound covers turned a little toward you, the second set lower. */
${N} .fh-books .fh-row{--fh-pad-top:clamp(90px,14.2vw,180px);--fh-pad-bottom:clamp(100px,14.9vw,190px)}
${N} .fh-books .fh-head--center{max-width:680px;margin-bottom:80px}
${N} .fh-book-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(40px,6vw,96px)}
${N} .fh-book{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
${N} .fh-book:nth-child(even){margin-top:64px}
${N} .fh-book-stage{perspective:1200px;margin-bottom:22px}
${N} .fh-cover{position:relative;width:280px;max-width:100%;aspect-ratio:2/3;border-radius:4px 16px 16px 4px;overflow:hidden;transform:rotateY(-10deg);box-shadow:inset 12px 0 18px -10px color-mix(in srgb,black 45%,transparent),inset -1px 0 0 color-mix(in srgb,white 15%,transparent),0 40px 70px -30px color-mix(in srgb,var(--cover-deep) 65%,transparent),0 0 0 1px color-mix(in srgb,black 8%,transparent)}
${N} .fh-cover[data-cover="jade"]{--cover-deep:var(--fh-jade-700);background:radial-gradient(80% 60% at 50% 38%,color-mix(in srgb,var(--fh-sage-300) 35%,transparent),transparent 70%),linear-gradient(160deg,color-mix(in srgb,var(--fh-jade-700) 82%,var(--fh-jade-500)),var(--fh-jade-700) 60%,color-mix(in srgb,var(--fh-jade-700) 60%,black))}
${N} .fh-cover[data-cover="oxblood"]{--cover-deep:var(--fh-kilim-700);background:radial-gradient(70% 55% at 50% 36%,color-mix(in srgb,var(--fh-amber-500) 45%,transparent),transparent 70%),linear-gradient(160deg,color-mix(in srgb,var(--fh-kilim-700) 80%,var(--fh-clay-500)),var(--fh-kilim-700) 60%,color-mix(in srgb,var(--fh-kilim-700) 55%,black))}
${N} .fh-cover-rule{position:absolute;inset:14px;border:1px solid color-mix(in srgb,var(--fh-saffron-300) 50%,transparent);border-radius:2px 10px 10px 2px}
${N} .fh-cover .fh-rays{position:absolute;left:50%;top:30px;width:240px;height:240px;transform:translateX(-50%);opacity:.8}
${N} .fh-cover-author{position:absolute;top:34px;left:0;right:0;text-align:center;${INSCRIPTION};font-size:10px;letter-spacing:.3em;color:var(--fh-saffron-300)}
${N} .fh-cover .fh-frame{position:absolute;left:50%;top:62px;width:132px;height:170px;margin:0;transform:translateX(-50%);box-shadow:0 0 0 4px var(--cover-deep),0 0 0 5px var(--fh-saffron-400)}
${N} .fh-cover-name{position:absolute;left:22px;right:22px;bottom:40px;text-align:center}
${N} .fh-cover-title{display:block;${DISPLAY};font-size:34px;line-height:1;color:var(--fh-cream-50)}
${N} .fh-cover-title em{font-weight:var(--weight-regular);color:var(--fh-saffron-300)}
${N} .fh-cover-sub{display:block;font-family:var(--font-display);font-style:italic;font-size:15px;line-height:1.25;color:var(--fh-saffron-100);margin-top:10px}
${N} .fh-book-title{${DISPLAY};font-size:40px;line-height:1.05;color:var(--text-strong)}
${N} .fh-book-title em{font-weight:var(--weight-regular)}
${N} .fh-book-sub{${LYRIC};font-size:22px;color:var(--text-lyric);margin-top:0}
${N} .fh-book p{margin:0;max-width:400px;font-size:16px;line-height:1.65}
${N} .fh-book .fh-actions{justify-content:center;gap:10px}

/* SPEAKING: a sticky arch with a round portrait tucked at its corner, and the booking letter beside it. */
${N} .fh-speaking .fh-row{--fh-pad-top:clamp(90px,14.2vw,180px);--fh-pad-bottom:clamp(80px,11.8vw,150px);display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(40px,6.4vw,80px);align-items:start}
${N} .fh-speak-art{position:sticky;top:110px}
${N} .fh-speak-art .fh-halo{position:absolute;left:-12%;top:-10%;width:64%;aspect-ratio:1}
${N} .fh-speak-art .fh-frame{aspect-ratio:3/4}
${N} .fh-speak-round{position:absolute;right:-18px;bottom:-20px;width:120px;height:120px;margin:0;box-shadow:var(--fh-depth-2)}
${N} .fh-speak-copy{display:flex;flex-direction:column;gap:20px}
${N} .fh-speak-name{margin:0;${DISPLAY};font-size:clamp(48px,5.6vw,80px);line-height:1;color:var(--text-strong)}
${N} .fh-speak-body{margin:0;max-width:520px;font-size:18px;line-height:1.7}
${N} .fh-topics{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0 8px -12px;padding:0;list-style:none}
${N} .fh-topic{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 18px;border-radius:var(--fh-radius-pill);font-family:var(--font-display);font-size:17px;font-weight:var(--weight-medium);line-height:1;color:var(--fh-clay-700)}
${N} .fh-speak-form-title{${DISPLAY};font-size:32px;line-height:1.1;color:var(--text-strong);margin-top:18px}
${N} .fh-speak-form-title em{font-weight:var(--weight-regular);color:var(--text-lyric)}
${N} .fh-booking{display:flex;flex-direction:column;gap:22px}
${N} .fh-booking-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 28px}
${N} .fh-field{display:flex;flex-direction:column;gap:8px;min-width:0}
${N} .fh-field[data-wide]{grid-column:1/-1}
${N} .fh-field-label{font-family:var(--font-lyric);font-style:italic;font-size:17px;color:var(--text-muted)}
${N} .fh-field input,${N} .fh-field select,${N} .fh-field textarea{box-sizing:border-box;width:100%;font:inherit;font-size:17px;color:var(--text-body-ink);background:transparent;border:0;border-radius:0;padding:12px 2px;border-bottom:1px solid color-mix(in srgb,var(--fh-brass-600) 45%,transparent)}
${N} .fh-field input,${N} .fh-field select{height:46px;padding-block:0}
${N} .fh-field textarea{resize:vertical;min-height:96px}
${N} .fh-field input::placeholder,${N} .fh-field textarea::placeholder{color:var(--text-muted)}
${N} .fh-field input:focus-visible,${N} .fh-field select:focus-visible,${N} .fh-field textarea:focus-visible{outline:2px solid var(--fh-clay-500);outline-offset:2px}
${N} .fh-booking-foot{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:6px}
${N} .fh-booking-note{${LYRIC};font-size:18px;color:var(--text-muted)}
${N} .fh-booking-done{${LYRIC};font-size:24px;line-height:1.3;color:var(--text-lyric)}
${N} .fh-booking-error{font-size:15px;color:var(--fh-clay-700)}
${N} .fh-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}

/* LINEAGE: five arches, the second and fourth set lower. */
${N} .fh-lineage .fh-row{--fh-pad-top:40px;--fh-pad-bottom:clamp(90px,13.4vw,170px)}
${N} .fh-lineage .fh-head--split{margin-bottom:40px;gap:24px}
${N} .fh-lineage-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:22px;align-items:start}
${N} .fh-lineage-grid .fh-frame{aspect-ratio:3/4.4}
${N} .fh-lineage-grid .fh-frame:nth-child(even){margin-top:36px}

@media (max-width:939px){
${N} .fh-hero .fh-row{grid-template-columns:1fr}
${N} .fh-hero-art{height:520px;max-width:520px;width:100%;margin:0 auto}
${N} .fh-seasons-grid{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:48px;margin-top:48px}
${N} .fh-season:nth-child(even){margin-top:32px}
${N} .fh-workshop-grid{grid-template-columns:1fr 1fr}
${N} .fh-workshop:nth-child(2){margin-top:32px}
${N} .fh-workshop:nth-child(3){margin-top:0}
${N} .fh-events .fh-row{grid-template-columns:1fr}
${N} .fh-events-art{max-width:420px;margin:0 auto;width:100%}
${N} .fh-book-grid{grid-template-columns:1fr;gap:64px}
${N} .fh-book:nth-child(even){margin-top:0}
${N} .fh-speaking .fh-row{grid-template-columns:1fr}
${N} .fh-speak-art{position:relative;top:auto;max-width:420px;margin:0 auto;width:100%}
${N} .fh-lineage-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:599px){
${N} .fh-hero-art{height:440px}
${N} .fh-seasons-grid{grid-template-columns:1fr 1fr;gap:36px 16px}
${N} .fh-season-name{font-size:30px}
${N} .fh-workshop-grid{grid-template-columns:1fr}
${N} .fh-workshop:nth-child(n){margin-top:0}
${N} .fh-event{grid-template-columns:64px minmax(0,1fr);gap:14px}
${N} .fh-event .hs-btn{grid-column:2;justify-self:start}
${N} .fh-event-day{font-size:38px}
${N} .fh-event-title{font-size:22px}
${N} .fh-booking-grid{grid-template-columns:1fr}
${N} .fh-lineage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`
