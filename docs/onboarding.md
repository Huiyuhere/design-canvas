# Onboarding your app onto the canvas

Goal: replace the Wavelength demo with your own product's screens. This guide is written to be handed directly to a coding agent ("read docs/onboarding.md and onboard the screens in ../my-app"), but works for humans too.

## Step 0 — Inventory your surfaces

List every customer-facing surface: screens, meaningful screen-states (empty, error, loaded), overlays/sheets, and toasts. Group them into 3–8 stakeholder workspaces (e.g. Growth, Onboarding, Core, System). Decide per surface where the real code lives on each platform — those become `codeRefs`.

## Step 1 — Configure the brand (`canvas.config.ts`)

Replace the demo values: `projectName`, `brandTokens` (your exact palette with usage notes), `extendedPalette` (neutral tints allowed in pickers but exempt from the off-palette lint), `fonts` (with a `job` description each), `bannedVocabulary` (your voice rules), `workspaces`, `device` (phone 393×852 or browser), `repos` (real `owner/repo` names so exports point agents at the right code), and optionally `githubIssueRepo`.

Update the font `<link>` in `client/index.html` and the "DEMO BRAND CSS" section of `client/src/index.css` to match.

## Step 2 — Vendor your screens (`client/src/surfaces/`)

For each surface, create a plain React component that mirrors the production screen **verbatim** — same copy, same colors, same spacing. Guidelines:

- Inline styles or plain CSS; no styling-framework dependency is assumed.
- Static and presentational: hardcode realistic data inline or accept a `seed` prop; no network calls.
- Use semantic tags (`h1`, `button`, `label`) — the inspector uses them for element roles.
- Interactive elements that navigate should call the `onNavigate(surfaceId)` prop (see demo surfaces) so play mode and the flow map work.
- Keep each file under 600 lines; split subcomponents if needed.

If you're porting from a React web app, this is mostly copy-paste-and-trim. From native apps, rebuild the screen's visual truth in React once — from then on the canvas is your cross-platform review surface.

## Step 3 — Register in `shared/surface-inventory.json`

One entry per surface:

```json
{
  "id": "home",
  "workspace": "core",
  "type": "screen",
  "name": "Home",
  "route": "/home",
  "sourceFile": "client/src/surfaces/Home.tsx",
  "codeRefs": {
    "web": "src/pages/Home.tsx",
    "ios": "ios/App/UI/HomeView.swift"
  },
  "nav": [
    { "trigger": "Settings icon", "to": "settings" },
    { "trigger": "Send button", "to": "toast:signal-sent" }
  ]
}
```

Rules: ids unique and stable (they key overrides); `workspace` must exist in config; `nav.to` must reference a registered surface id (or `toast:*` with a registered toast surface); screen-states set `parent` and `conditional`.

## Step 4 — Mount (`client/src/canvas/mounts.tsx`)

```tsx
MOUNTS["home"] = { render: (nav) => <Home onNavigate={nav} /> };
```

## Step 5 — Verify

```bash
pnpm audit:coverage   # ids, workspaces, nav graph, mount coverage
pnpm check && pnpm test
pnpm dev              # visually confirm every frame renders
```

Then delete the demo: remove `client/src/surfaces/*` demo files, their inventory entries, and mounts — the audit will catch anything dangling.
