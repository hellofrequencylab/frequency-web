// LIGHT DISMISS FOR <details> POPUPS (LIVE-745). A LEAF: no imports, so the root layout can inline
// the script without pulling anything into every route's graph.
//
// THE BUG. A native <details> is an accordion, not a popup: it closes only when its own <summary> is
// clicked. Used as a dropdown (the Space menu's old "More", the "More" group in underline-tabs) it
// stayed hanging open after a click outside, after picking an item whose link changed only the query
// or hash (no remount, so `key={pathname}` never fired), and on Escape. That is the "once it's up it
// never closes" popup the owner reported in more than one place.
//
// THE FIX, ONCE. A <details> marked `data-popover` gets popup behaviour from three document-level
// listeners installed before hydration: a click outside closes it, a click on a link or button
// inside it closes it (navigation still proceeds, nothing is prevented), and Escape closes it and
// returns focus to its summary. Opening one closes any other. Plain accordions carry no marker and
// are untouched. Listening on `document` from the head means it survives every client navigation
// and covers the prerendered public pages, which mount no client component for the menu.

/** The attribute that opts a <details> into popup behaviour. */
export const POPOVER_ATTR = 'data-popover'

export const POPOVER_DISMISS_SCRIPT = `(function(){var d=document,S='details[${POPOVER_ATTR}][open]';
function shut(keep){var o=d.querySelectorAll(S);for(var i=0;i<o.length;i++){if(o[i]!==keep)o[i].removeAttribute('open')}}
d.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest){shut(null);return}
var p=t.closest('details[${POPOVER_ATTR}]');if(!p){shut(null);return}
var s=t.closest('summary');if(s&&s.parentNode===p){shut(p);return}
if(t.closest('a[href],button'))p.removeAttribute('open')});
d.addEventListener('keydown',function(e){if(e.key!=='Escape')return;var o=d.querySelectorAll(S);if(!o.length)return;
var a=d.activeElement;for(var i=0;i<o.length;i++){if(a&&o[i].contains(a)){var s=o[i].querySelector('summary');if(s)s.focus()}o[i].removeAttribute('open')}});
})();`
