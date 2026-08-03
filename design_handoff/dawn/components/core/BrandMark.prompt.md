The Frequency wordmark as an engraved, tinted fill — the logo PNG is used as an alpha mask, filled warm-brown, with a two-tone emboss and a slow amber shine sweep. Reads as burnt-in. Hover lifts the catch-light; press deepens the engrave.

```jsx
<BrandMark logo="assets/frequency-logo.png" width={200} height={41} href="/" />
```

- Pass `logo` relative to the page using it; set `width`/`height` to the logo's aspect ratio.
- The engrave + shine adapt to light/dark via the `--brand-*` tokens. Honors prefers-reduced-motion.
- For a plain knockout (e.g. on a photo), use a tinted `<img>` instead of the engraved mark.
