---
name: ios-conversion
description: Convert Design Canvas surfaces (React) into SwiftUI views that match the canvas simulation exactly — fonts, colors, sizes, placement, and images — then verify with the built-in parity audit. Use when asked to port screens to iOS, generate Swift/SwiftUI from the canvas, or verify an existing Swift port against the design.
---

# iOS Conversion Skill

This skill turns any surface on the Design Canvas into a SwiftUI view and
**proves** the result matches the simulation pixel-for-pixel on five audited
dimensions: font, color, size, placement, and images. It works for Codex,
Claude Code, Kimi, Manus, and any other coding agent with shell access.

## Mental model

The pipeline has three artifacts per surface:

| Artifact | What it is | Ground truth for |
|---|---|---|
| `swift-out/<id>.snapshot.json` | Computed styles + layout boxes captured from the live rendered surface (all canvas edits applied) | Everything |
| `swift-out/<View>.swift` | Generated SwiftUI: a positioned `ZStack` blueprint that renders identically | The literal port |
| Parity report | Diff of the .swift against the snapshot | Whether the port is exact |

The snapshot — not the React source — is the contract. It records what the
browser actually rendered: resolved fonts, computed colors, real boxes in
393×852 device points. The generator emits absolute positions, so the Swift
file compiles in Xcode and renders the same screen without any layout guessing.

## Step 1 — Export

```bash
pnpm dev &                                  # canvas must be running
pnpm add -D playwright && pnpm exec playwright install chromium   # once
pnpm swift:export                           # all surfaces
pnpm swift:export -- home settings          # or specific ids (see shared/surface-inventory.json)
```

No playwright? Open `/ios/<surfaceId>` in a browser, click **Snapshot** and
**Download**, put both files in a directory, then:

```bash
pnpm swift:export -- --from-json <dir>
```

The exporter writes `swift-out/<View>.swift` + snapshot JSONs and runs the
audit automatically; it exits non-zero on any mismatch.

## Step 2 — Verify parity (always, after any edit)

```bash
pnpm swift:parity          # audits every .swift in swift-out/ against its snapshot
```

A `PARITY PASSED` line means every text run's font family/size/weight/italic,
every foreground/background/border color, every box's size and center
position (±0.1pt), and every image URL + fill mode in the Swift file match the
simulation exactly. Treat `PARITY FAILED` as a hard gate: fix or re-export,
never ship a failing view. The `/ios/<surfaceId>` page shows the same audit
live with an Xcode-style side-by-side preview.

## Step 3 — Refactor into idiomatic SwiftUI (optional, guarded)

The generated ZStack is deliberately literal. When the user wants idiomatic
SwiftUI (VStack/HStack, Spacer, safe areas, Dynamic Type):

1. Keep the generated file as `<View>Blueprint.swift` — never edit it.
2. Write the idiomatic version alongside it, reading exact values (colors,
   font sizes, spacing) from the blueprint, not from memory.
3. Extract repeated colors/fonts into a `DesignTokens.swift` enum; values come
   from `shared/tokens.ts` (the canvas brand palette) — hex must match.
4. Re-run `pnpm swift:parity` — the blueprint still passing proves your token
   values are correct; visually diff your idiomatic view against
   `/ios/<surfaceId>`'s simulator pane.
5. Images: the blueprint uses `AsyncImage` with the canvas URL. For production,
   download assets into the Xcode asset catalog and swap to `Image(...)`,
   keeping the recorded `w×h` and content mode.

## Interpreting audit failures

| Dimension | Typical cause | Fix |
|---|---|---|
| `font` | Hand-edited size/weight, or wrong `.custom` family | Restore value from snapshot |
| `color` | Rounded RGB, token drift | Copy the exact `Color(red:green:blue:)` literal |
| `size` / `placement` | Edited `.frame`/`.position` | Re-export instead of nudging by hand |
| `image` | Changed URL or `.fit`/`.fill` | Match `imageSrc` + `imageMode` from snapshot |
| `text` | Copy edited in Swift but not on canvas | Make copy changes on the canvas, re-export |

## Rules

- The canvas is the source of truth. Design changes happen there (visually or
  via the change-log workflow in AGENTS.md), then re-export. Never fork the
  design inside Swift.
- Custom fonts (`.custom("Georgia", ...)`, `.custom("Nunito", ...)`) must be
  registered in the Xcode project (Info.plist `UIAppFonts`) or swapped for
  system equivalents deliberately — note the substitution in your PR.
- The 393×852 coordinate space is iPhone 15 Pro points. For other devices,
  refactor to relative layout (Step 3) rather than scaling absolute positions.
- `swift-out/` is gitignored; generated blueprints are build artifacts.
  Commit only refactored, human-reviewed Swift to an app repo.
