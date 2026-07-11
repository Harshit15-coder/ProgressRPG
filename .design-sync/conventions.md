## Wrapping and setup

No app-level provider or theme root is required to render these components — each component manages its own styling and state locally (no ThemeProvider/context to wrap the whole app in). The one exception: **`Tooltip` requires a `TooltipProvider` ancestor** (Radix Tooltip). Mount one `TooltipProvider` near the root of whatever you're building and nest every `Tooltip` under it:

```jsx
const { TooltipProvider, Tooltip, Button } = window.ProgressRPG;

<TooltipProvider>
  <Tooltip content="Helpful context">
    <Button variant="secondary">Hover or focus me</Button>
  </Tooltip>
</TooltipProvider>
```

`AlertDialog` and `Modal` render their visible content through a React portal straight to `document.body` (Radix `Portal`) — they don't need a wrapper, but be aware their DOM output appears outside wherever you mounted them, so don't rely on CSS scoping/descendant selectors reaching into them from a parent.

## Styling idiom

This is a **CSS Modules** design system, not a token/utility-class system: every component ships pre-compiled, build-hashed class names (e.g. `._button_1n01q_1`) with values baked in directly (colors, spacing, radii as literal `rem`/`px`, not `var(--token)` custom properties). There is no CSS custom-property token layer to theme against — don't invent `var(--progressrpg-*)` names, they don't exist. To restyle or extend a component, wrap it and apply your own classes/styles to a wrapper element, or pass the component's own documented style props (see each `<Name>.d.ts`) — never target the compiled `._xxx_hash_n` classes directly, they change on rebuild.

Base typography is **Roboto** (falls back to system sans-serif); base font size steps up at the `768px` breakpoint (mobile-first responsive type, matching the app's own layout).

## Where the truth lives

- `styles.css` at the bundle root — the only stylesheet to link; it `@import`s `_ds_bundle.css` (all component styles).
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage doc (props + real examples from this DS's own Storybook stories).
- `components/<group>/<Name>/<Name>.d.ts` — the authoritative prop contract, extracted from the real shipped TypeScript.
- Component variants (Button: `primary`/`secondary`/`danger`/`secondaryDanger`, ProgressBar colors, Input types) are documented per-component in their `.prompt.md` — read those before composing rather than guessing prop names.

## Example build

```jsx
const { Form, Input, Button } = window.ProgressRPG;

<Form
  fields={[
    { name: 'email', label: 'Email address', type: 'email', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ]}
  onSubmit={handleSubmit}
/>
```

For layout/spacing around these components (the glue between them, not the components themselves), use plain CSS on your own wrapper elements — this DS does not ship a layout/grid utility system.
