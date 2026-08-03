The one page-header grammar (brief 05 §4). Open every template with it.

```jsx
<PageHeading
  eyebrow="Thursday · Leucadia"
  title="Sound bath at the shop"
  subtitle="Eleven people, folding chairs, an hour of talking after."
  actions={<Button>RSVP</Button>}
/>
```

- The eyebrow is Space Grotesk uppercase, tracked 0.18em. Keep it factual (a place, a date, a rank), never a marketing shout.
- Titles are weight 700 with tight tracking. Do not bump to 800.
- `size="section"` reuses the same grammar inside a Detail page at smaller scale, which is how one spatial logic repeats.
