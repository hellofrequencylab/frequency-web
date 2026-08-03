A card for a distinct object. The Index template is a grid of these.

```jsx
<EntityCard
  cover="assets/images/gathering-1.jpg"
  icon="users"
  eyebrow="Circle · Leucadia"
  title="Sunrise Cold Plunge"
  meta="14 members · meets Saturdays"
  footer={<Button size="sm">Join</Button>}
>
  Three minutes in the water, coffee after. No pace pressure.
</EntityCard>
```

- `accent="signal"` for events, `"move"` for movement practices, `"broadcast"` for dispatches. Amber stays the default.
- Never stack these for a list of rows — that is the identical-bordered-card tell the direction exists to avoid.
