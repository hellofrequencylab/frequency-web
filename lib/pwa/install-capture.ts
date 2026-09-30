// The pre-hydration half of "Install the app" (LIVE-703, ADR-1630). A LEAF: no imports, so the root
// layout can inline the script without pulling anything into every route's graph.
//
// Two jobs, both of which have to happen before React is on the page:
//
//   1. CAPTURE `beforeinstallprompt`. Chromium fires it once per page load, as soon as the page is
//      installable, which on a fast connection is before the (main) shell has hydrated. A listener
//      added from a component can miss it, and a missed event cannot be asked for again until the
//      next full load. So the head script takes it, calls preventDefault() (which also keeps
//      Android Chrome's own install mini-bar off the screen: the owner ruled that installing is
//      never offered on a first visit, and that bar is exactly a first-visit offer), and parks the
//      event on `window` for the card to fire from a tap. `appinstalled` clears it.
//   2. STAMP the device's first visit. The first load that finds no `frequency.firstSeen` writes
//      the time and marks this browser session as the first visit, so a card can tell "first
//      visit" from "came back". Local only, never sent anywhere, and every write is guarded:
//      blocked storage leaves the device reading as a first visit, which shows nothing.
//
// Readers live in components/push/install.ts. Keep the literals below in step with it (it imports
// them from here, so a rename moves both).

/** Epoch ms of the first load of Frequency on this device. */
export const FIRST_SEEN_KEY = 'frequency.firstSeen'
/** sessionStorage flag: "1" in the browser session that wrote FIRST_SEEN_KEY. */
export const FIRST_VISIT_KEY = 'frequency.firstVisit'
/** The window property that holds the captured install prompt, or null. */
export const INSTALL_PROMPT_PROP = '__frequencyInstallPrompt'
/** Dispatched on window whenever the held prompt changes (captured, used, or installed). */
export const INSTALL_PROMPT_EVENT = 'frequency:installprompt'

export const INSTALL_CAPTURE_SCRIPT = `(function(){var w=window;
try{var l=w.localStorage;if(!l.getItem(${JSON.stringify(FIRST_SEEN_KEY)})){l.setItem(${JSON.stringify(FIRST_SEEN_KEY)},String(Date.now()));w.sessionStorage.setItem(${JSON.stringify(FIRST_VISIT_KEY)},"1");}}catch(e){}
function held(v){w[${JSON.stringify(INSTALL_PROMPT_PROP)}]=v;try{w.dispatchEvent(new Event(${JSON.stringify(INSTALL_PROMPT_EVENT)}));}catch(e){}}
w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();held(e);});
w.addEventListener("appinstalled",function(){held(null);});
})();`
