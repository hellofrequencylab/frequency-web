A styled native dropdown (toolbar filters, settings) matching Input chrome with a warm chevron.

```jsx
<Select label="Channel" options={['Mind', 'Body', 'Spirit', 'Expression']} />
<Select options={[{ value: 'near', label: 'Near you' }, { value: 'new', label: 'Newest' }]} />
```

- Pass `options` as strings or `{value,label}`. Forwards native `<select>` props (value, onChange, …).
