The one marketing section header — a tracked uppercase eyebrow, a heavy Anton display H2, and an optional italic kicker (the editorial "deck"). Every marketing page heading routes through this.

```jsx
<SectionHeading
  eyebrow="The Community"
  title={<>Find <span className="text-primary">your people</span></>}
  kicker="Belonging you can feel: faces that light up, being known by name."
  align="center"
/>
```

- Eyebrow tracking is locked at 0.25em. Accent exactly one keyword in the title with `className="text-primary"`.
- Use `tone="ink"` on a dark band; `size="sm"` for sub-section headings.
