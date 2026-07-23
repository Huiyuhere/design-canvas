# AGENTS.md — instructions for coding agents

This file is for AI coding agents (Codex, Claude Code, Kimi, Manus, Cursor, Windsurf, …) working **inside this repository**. If you were handed a Design Canvas *change-log export* and asked to apply it to an app codebase, read `docs/export-format.md` instead — this file is about developing the canvas itself and onboarding app screens onto it.

## What this project is

A self-contained design review tool. Real React components ("surfaces") render inside device frames on an infinite canvas; reviewers edit them visually; every edit is captured in a schema-validated change log anchored to source `file:line`, exportable as Markdown/JSON for coding agents to apply to the product's real repos.

## Architecture map

```
canvas.config.ts                  ← product config: brand, workspaces, device, repos
shared/
  surface-inventory.json          ← ground truth: every surface, nav edges, codeRefs
  changeSchema.ts                 ← Zod schemas: changeEntrySchema, sessionEntrySchema, OPS
  tokens.ts                       ← brand tokens/lint helpers (thin wrapper over config)
  richtext.ts                     ← strong/em/br subset sanitizer + span colors + lints
client/src/
  surfaces/                       ← demo app screens (REPLACE with your app's screens)
  canvas/
    registry.tsx                  ← loads inventory, exposes SURFACES/WORKSPACES/edges
    mounts.tsx                    ← surfaceId → React component binding (+ seeds)
    store.tsx                     ← CanvasStore: overrides, inserted, changeLog, undo/redo
    instrument.ts                 ← data-loc → element ids ("file@line#n")
    DeviceFrame.tsx               ← bezel, dark-mode filter, Dynamic Type, clamping
    InfiniteCanvas.tsx            ← zoom/pan viewport
    Inspector.tsx                 ← right-panel editing UI
    Panels.tsx                    ← flow tree, change log, sessions, exports
    FlowArrows.tsx, layout.ts     ← flow map + grid layout
  pages/CanvasPage.tsx            ← main page wiring
  pages/PreviewPage.tsx           ← single-surface preview (polls state)
server/
  index.ts                        ← Express + Vite middleware; PORT env
  routers.ts                      ← tRPC: canvas.get / canvas.save (schema-validated)
  store.ts                        ← JSON persistence to .canvas/state.json (atomic)
scripts/
  audit-coverage.ts               ← inventory validator (ids, workspaces, nav, mounts)
  check-file-size.mjs             ← 600-line-per-file gate
```

## Hard rules

1. **600-line limit per file** (`pnpm check:size`). Split modules rather than exceed it.
2. **Never edit element ids or the change-entry schema casually** — exported logs are a public contract. Any schema change must update `shared/changeSchema.ts`, `docs/export-format.md`, and the tests together.
3. **`shared/surface-inventory.json` is ground truth.** Registry, mounts, flow map, and audit all derive from it. When adding/removing surfaces, update the inventory first, then mounts, then run `pnpm audit:coverage`.
4. **Keep the jsx-loc plugin.** Element anchoring depends on `@builder.io/vite-plugin-jsx-loc` injecting `data-loc` attributes. Removing it silently breaks every source anchor.
5. **No external services.** Do not add databases, auth, analytics, or network calls. Persistence stays a local JSON file.
6. **Surfaces are vendored blueprints.** Keep copy verbatim with the product source they mirror; tests assert exact phrases (see `server/canvas.failures.test.ts` F2).
7. **The snapshot schema is a contract.** `shared/uiSnapshot.ts` feeds the SwiftUI generator (`shared/swiftgen.ts`), the parity audit (`shared/swiftparity.ts`), and the `/ios` preview. Changing any of the three requires updating the others plus `server/swiftgen.test.ts` in the same patch — the round-trip test (generate → audit → zero issues) must stay green.

## Quality gates (run all before finishing)

```bash
pnpm check            # tsc --noEmit
pnpm check:size       # 600-line rule
pnpm audit:coverage   # inventory/mounts/nav integrity
pnpm test             # vitest — 101 tests must pass
```

## Common tasks

### Add a new surface
1. Create the component in `client/src/surfaces/` (plain React, inline styles fine).
2. Add an entry to `shared/surface-inventory.json`: unique `id`, existing `workspace`, `type` (`screen` | `screen-state` | `overlay` | `interstitial` | `toast`), `route`, `sourceFile` (canvas-relative path), `nav` edges, and `codeRefs` per platform.
3. Bind it in `client/src/canvas/mounts.tsx` (`MOUNTS[id] = { render: ... }`).
4. `pnpm audit:coverage && pnpm test`.

### Change the brand / adopt a new product
Edit `canvas.config.ts` only — tokens, fonts, banned vocabulary, workspaces, device frame, repo names. UI chrome, pickers, and lints all read from it. Global CSS brand rules (fonts, dark-mode doctrine) live in `client/src/index.css` under the "DEMO BRAND CSS" banner.

### Modify editing behavior
`CanvasStore` (in `store.tsx`) is the single mutation path: `applyOverride`, `insertElement`, `deleteElement`, `undoLast`, `redoLast`, `saveSession`. Every mutation must emit an entry that parses against `changeEntrySchema`. Tests in `server/undoRedo.test.ts` and `server/canvas.failures.test.ts` encode the guarantees — extend them with any new op.

### Convert surfaces to SwiftUI / audit parity
Follow `skills/ios-conversion/SKILL.md`. Short version: `pnpm swift:export` captures computed-style snapshots (via the `/ios/:surfaceId` page) and generates `swift-out/<View>.swift`; `pnpm swift:parity` verifies font/color/size/placement/image parity and must exit 0. The `/ios` page shows the same audit live in Xcode-style chrome. Never hand-tune generated values — re-export.

## Element id contract

Instrumented elements get ids of the form `<sourceFile>@<line>#<n>` (e.g. `client/src/surfaces/Landing.tsx@142`), parsed by `store.tsx` into `sourceFile` + `line` on each change entry. Inserted elements get `ins-*` ids anchored to an existing element. Ids starting with `client/src/components/` are treated as shared-chrome anchors.

## Testing conventions

- Engine tests live in `server/*.test.ts` (they import client modules directly — vitest, node env).
- Name failure-case tests after the failure they catch (see `canvas.failures.test.ts` F1–F21).
- Any bug fix ships with a test that would have caught it.
