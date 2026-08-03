// Scroll reveal for `.reveal` (delay comes from `.stagger` on the parent).
//
// The rule is "reveal once it has been reached OR passed" — not "once it is
// visible". An observer that only fires on isIntersecting leaves anything the
// viewport skipped (fast wheel, PageDown, End, an anchor jump, a reload with a
// restored scroll position) stuck at opacity 0 forever. So every code path here
// ends in the same one-way latch, and a sweep catches whatever the observer
// missed.
(() => {
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = (el) => el.classList.add('is-revealed');

  // Anything at or above the fold line counts as reached. Generous on purpose:
  // arriving late is worse than arriving early.
  const reached = (el) => el.getBoundingClientRect().top < window.innerHeight * 0.92;

  let io = null;
  const observe = (el) => {
    if (!io) return;
    io.observe(el);
  };

  const sweep = () => {
    const els = document.querySelectorAll('.reveal:not(.is-revealed)');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || reduce()) { els.forEach(show); return; }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          // isIntersecting OR already scrolled past the top edge.
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            show(e.target);
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    }
    els.forEach((el) => (reached(el) ? show(el) : observe(el)));
  };

  const kick = () => { sweep(); requestAnimationFrame(sweep); };
  document.addEventListener('DOMContentLoaded', kick);
  addEventListener('load', kick);
  addEventListener('scroll', sweep, { passive: true });
  addEventListener('resize', sweep);
  // React mounts after this file runs, so watch for the tree arriving too.
  new MutationObserver(kick).observe(document.documentElement, { childList: true, subtree: true });
  kick();
})();
