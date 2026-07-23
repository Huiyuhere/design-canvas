# Repo ingestion — from an existing codebase to a populated canvas

This guide covers the step *before* [`onboarding.md`](onboarding.md): you have a
real repository (yours or your team's) and want to read it, pull out all of the
frontend, and segment it into workspaces on the canvas. It is written to be
handed directly to a coding agent:

> Clone `<owner>/<repo>`, then follow `docs/repo-ingestion.md` in this canvas
> repo: map the frontend, extract every customer-facing surface into
> `client/src/surfaces/`, and segment them into workspaces in
> `shared/surface-inventory.json`. Finish with `pnpm audit:coverage && pnpm test`.

## Phase 1 — Read the repo

Work from a local clone next to the canvas repo (`git clone <url> ../my-app`) so
`codeRefs` can be verified against real paths. Build a mental (and written) map
before extracting anything:

| Question | How to answer it |
|---|---|
| What framework renders the UI? | Check `package.json` deps (`react`, `next`, `vue`, `svelte`), or `*.xcodeproj` / `build.gradle` for native apps |
| Where do routes live? | Next.js: `app/` or `pages/`; React Router/wouter: grep `createBrowserRouter\|<Route`; Expo: `app/`; SwiftUI: `NavigationStack\|TabView` |
| Where are the screen components? | Follow each route to its component file; note the directory convention (`pages/`, `screens/`, `features/*/routes/`) |
| Where is the design system? | Tailwind config, CSS variables in a global stylesheet, `theme.ts`, asset-catalog colors — this feeds `canvas.config.ts` `brandTokens` and `fonts` |
| Where is the copy? | Inline JSX strings, i18n JSON (`locales/en.json`), or CMS calls — the canvas needs the resolved English strings |

A practical reading order: `package.json` → router file(s) → one representative
screen end-to-end (component → hooks → styles) → the theme/tokens source. Record
findings in a scratch file; the route table you build here becomes the skeleton
of the surface inventory.

## Phase 2 — Pull out the frontend

The canvas wants **visual truth, not logic**. For each route/screen, extract the
rendered result and drop everything else:

1. **Enumerate surfaces from the router, not the file tree.** Every reachable
   route is a candidate screen. Then add non-route surfaces: modals/sheets
   (grep `Dialog\|Sheet\|Modal\|bottomSheet`), toasts (`toast(\|Snackbar`), and
   meaningful screen-states — empty, loading-done-but-zero-items, error, paywall
   variants. A 12-route app commonly yields 20–35 surfaces.
2. **Vendor each surface as a plain React component** in
   `client/src/surfaces/`, mirroring copy, colors, spacing, and hierarchy
   verbatim. Strip: data fetching (hardcode one realistic dataset inline),
   auth guards, analytics, feature flags (pick the shipped variant), and
   provider wrappers. Keep: exact strings, semantic tags (`h1`, `button`,
   `label`), and layout structure.
3. **Resolve styles to concrete values.** Tailwind classes, styled-components,
   or SwiftUI modifiers all flatten to inline styles with literal values taken
   from the design tokens you mapped in Phase 1. Put the palette itself into
   `canvas.config.ts` so the color picker and off-palette lint enforce it.
4. **Wire navigation, not handlers.** Wherever the original called
   `router.push('/settings')` or presented a sheet, call the `onNavigate`
   prop with the target surface id. This single substitution powers play mode
   and the flow map.
5. **Record provenance.** Set `codeRefs` per surface to the real path in the
   source repo (`"web": "src/pages/Settings.tsx"`, `"ios": "ios/App/UI/SettingsView.swift"`).
   This is what lets exported change logs point agents back at production code.

Non-React sources (SwiftUI, Kotlin, Vue, Svelte) follow the same recipe — the
one-time cost is re-expressing each screen's visual truth in React; afterwards
the canvas is the shared review surface and `codeRefs` keep edits flowing back
to the native code. For pixel-exact reference, run the app and keep a
screenshot beside each vendored surface while porting.

## Phase 3 — Segment into workspaces

Workspaces are the canvas's unit of segmentation: each gets its own rail entry,
flow rows, and change-badge counts. Segment by **stakeholder journey**, not by
code structure — the people reviewing "Growth" are rarely the people reviewing
"System & Edge". A segmentation that works for most products:

| Workspace | Typical surfaces |
|---|---|
| Growth | Landing, pricing, sign-up/sign-in, invite |
| Onboarding | First-run steps, permissions, profile setup |
| Core | The main loop: home/feed, detail views, compose, checkout |
| Account | Profile, settings, billing, notifications |
| System & Edge | 404/error states, empty states, toasts, offline |

Rules of thumb: 3–8 workspaces; every surface belongs to exactly one
(`pnpm audit:coverage` enforces this); screen-states live in the same workspace
as their parent; if one workspace exceeds ~20 surfaces, split it along a real
review boundary (e.g. Core → Browsing + Purchase).

**Segmenting multiple projects.** For a monorepo or a product family (web app +
marketing site + admin), prefer one canvas copy per product, since brand config
is global per canvas. Use workspaces *within* each canvas for journeys. If two
products truly share one brand and one review team, they can share a canvas
with per-product workspaces (`web-core`, `admin-core`) and per-surface
`codeRefs` pointing at their respective repos in `canvas.config.ts` `repos`.

## Phase 4 — Verify the ingestion

```bash
pnpm audit:coverage   # ids unique, workspaces valid, nav edges resolve, all surfaces mounted
pnpm check && pnpm test
pnpm dev              # walk every workspace; toggle Flows; enter Play mode and click through
```

Then diff visually against the running product: same copy, same colors, same
order of elements. Anything that drifted here will silently corrupt every
change log exported later, so this check is worth doing screen by screen.

## Agent prompt (copy-paste)

> You are onboarding an existing app onto Design Canvas. Repo to ingest:
> `<owner>/<repo>` (cloned at `../my-app`). Follow `docs/repo-ingestion.md`
> phases 1–4: (1) map the router, screens, design tokens, and copy sources and
> write the map to `INGESTION-NOTES.md`; (2) vendor every customer-facing
> surface into `client/src/surfaces/` verbatim (strip logic, keep visual truth,
> wire `onNavigate`, set real `codeRefs`); (3) configure `canvas.config.ts`
> with the product's real tokens/fonts/vocabulary and segment surfaces into
> 3–8 journey workspaces in `shared/surface-inventory.json`; (4) mount
> everything in `mounts.tsx` and make `pnpm audit:coverage`, `pnpm check`, and
> `pnpm test` pass. Do not invent copy or colors — extract them.
