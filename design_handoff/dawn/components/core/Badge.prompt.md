A small status / category pill in the semantic palette — amber `primary`, teal `signal`, azure `broadcast`, plus state tones.

```jsx
<Badge tone="primary">Founder</Badge>
<Badge tone="broadcast" icon={<Megaphone size={12} />}>Dispatch</Badge>
<Badge tone="success">Verified</Badge>
<Badge tone="primary" solid>New</Badge>
```

- Tones: `neutral` · `primary` · `signal` · `broadcast` · `success` (teal) · `warning` · `danger`.
- `solid` fills with the tone color. Use one accent per row; reserve `broadcast` for comms only.
