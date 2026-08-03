The one Frequency surface card. A card means a *distinct object* — for lists or rail sections, group with a title + whitespace instead of boxing each row.

```jsx
<Card tone="feature" hover>
  <h3 style={{ fontSize: 17, fontWeight: 700 }}>River Run Circle</h3>
  <p className="text-muted" style={{ fontSize: 14 }}>Encinitas · 18 members</p>
</Card>

<Card tone="elevated" radius="2xl">…featured marketing tier…</Card>
```

- Tones: `soft` (borderless tint, for grouped panels) · `feature` (hairline box, default) · `elevated` (pop shadow, marketing).
- `radius`: `xl` for in-app, `2xl` for marketing feature cards/media.
- Set `hover` for clickable cards (lifts to shadow-md + amber border).
