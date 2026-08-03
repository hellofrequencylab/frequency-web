A toggle for instant on/off settings (notifications, presence, demo content). Amber when on.

```jsx
const [on, setOn] = React.useState(true)
<Switch checked={on} onChange={setOn} label="Show demo content" />
```

- Controlled: pass `checked` + `onChange(next)`. Omit `label` for a bare switch.
