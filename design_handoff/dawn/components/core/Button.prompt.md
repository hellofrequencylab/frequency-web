The one Frequency action button — amber `primary` (the only filled chrome accent), `secondary` outline, or `ghost` text link; renders an `<a>` when given `href`.

```jsx
<Button href="/onboarding/beta" variant="primary" size="md" iconRight={<ArrowRight size={18} />}>
  Join the Beta
</Button>

<Button variant="secondary">See the space</Button>
<Button variant="ghost">Learn more</Button>
```

- Variants: `primary` (amber fill + pop shadow + embossed label) · `secondary` (warm outline) · `ghost` (amber text link).
- Sizes: `sm` · `md` (default) · `lg`. Lock to these — don't hand-pass padding.
- Pass `href` for navigations (renders `<a>`); omit for `<button>` with `onClick`.
- Never invent a second accent color: only amber fills. Use `secondary`/`ghost` for everything else.
