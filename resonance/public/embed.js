/*
 * Resonance embed snippet (host side). Dependency-free.
 *
 * Mounts the Resonance world in an iframe and completes the postMessage
 * handshake: the world announces `world:ready`, then we send the host-issued
 * federated JWT (`user:identity`). The world re-verifies that JWT server-side
 * with RESONANCE_HOST_JWT_PUBLIC_KEY, so the token here is the only identity it
 * trusts. Every message we post is TARGETED at the Resonance origin, and every
 * message we receive is checked against it, so no other frame can spoof us.
 *
 * The host must ALSO add its origin to NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS on
 * the Resonance side, or the world will ignore our messages.
 *
 * Usage:
 *   <div id="resonance"></div>
 *   <script src="https://resonance.example/embed.js"></script>
 *   <script>
 *     ResonanceEmbed.mount({
 *       target: "#resonance",
 *       origin: "https://resonance.example", // where Resonance is hosted
 *       venueId: "abc-123",
 *       token: "<host-signed RS256 JWT>",    // optional; omit for anonymous
 *     });
 *   </script>
 */
(function (global) {
  "use strict";

  function mount(opts) {
    var origin = opts.origin;
    if (!origin) throw new Error("ResonanceEmbed: `origin` is required");
    if (!opts.venueId) throw new Error("ResonanceEmbed: `venueId` is required");

    var target =
      typeof opts.target === "string"
        ? document.querySelector(opts.target)
        : opts.target || document.body;
    if (!target) throw new Error("ResonanceEmbed: target element not found");

    // Build the iframe src. A token on the URL gives identity on first paint;
    // we ALSO post it on `world:ready` to cover slow loads and token refresh.
    var src = origin.replace(/\/$/, "") + "/embed/" + encodeURIComponent(opts.venueId);
    if (opts.token) src += "?token=" + encodeURIComponent(opts.token);

    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.allow = "autoplay; encrypted-media";
    iframe.style.width = "100%";
    iframe.style.height = (opts.height || 720) + "px";
    iframe.style.border = "0";
    target.appendChild(iframe);

    function postToWorld(message) {
      // Always target the Resonance origin — never "*".
      if (iframe.contentWindow) iframe.contentWindow.postMessage(message, origin);
    }

    function onMessage(event) {
      // Only trust messages from the Resonance frame at the expected origin.
      if (event.origin !== origin) return;
      if (event.source !== iframe.contentWindow) return;
      var data = event.data || {};

      if (data.type === "world:ready") {
        if (opts.token) postToWorld({ type: "user:identity", token: opts.token });
        if (opts.theme) postToWorld({ type: "theme", tokens: opts.theme });
        if (typeof opts.onReady === "function") opts.onReady();
      } else if (data.type === "resize" && typeof data.height === "number") {
        iframe.style.height = data.height + "px";
      } else if (typeof opts.onEvent === "function") {
        // Forward game/mirror events (zaps:awarded, rank:changed, ...).
        opts.onEvent(data);
      }
    }

    window.addEventListener("message", onMessage);

    return {
      iframe: iframe,
      // Push a fresh token (e.g. before the 10-minute JWT expires).
      setToken: function (token) {
        postToWorld({ type: "user:identity", token: token });
      },
      // Push host brand tokens to theme the embed.
      setTheme: function (tokens) {
        postToWorld({ type: "theme", tokens: tokens });
      },
      // Tear down: remove the listener and the iframe.
      destroy: function () {
        window.removeEventListener("message", onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      },
    };
  }

  global.ResonanceEmbed = { mount: mount };
})(typeof window !== "undefined" ? window : this);
