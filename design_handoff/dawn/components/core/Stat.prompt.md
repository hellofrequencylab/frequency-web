A big Anton display numeral over an uppercase label — the editorial way Frequency shows counts. Group three in a row for a stat strip.

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
  <Stat value={24} label="Circles near you" />
  <Stat value="1.2k" label="Practices this week" />
  <Stat value={38} label="Events" />
</div>
```

- Use `tone="ink"` inside a dark `bg-slat` band.
- Honor the social-proof floor: below ~25 members show founding framing, not a "0".
