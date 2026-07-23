# Design Canvas

**A code-native design review canvas.** Render your real app screens — actual React components, not mockups — on an infinite Figma-style canvas, edit them visually, and export schema-validated change logs that AI coding agents (Codex, Claude Code, Kimi, Manus, Cursor, …) apply directly back to your source code.

No Figma file that drifts from the code. No screenshots annotated in Slack. The canvas **is** the code, and every visual edit becomes a precise, file-and-line-anchored instruction.

---

## Why

Design tools and codebases drift apart. A designer moves a button in Figma; three weeks later the app still shows the old layout, because translating design intent into code changes is manual, lossy work.

Design Canvas flips the model:

1. **Your screens are real components.** Each frame on the canvas mounts a real React component — same copy, same tokens, same layout logic that ships.
2. **Edits are captured as structured data.** Click any element to select it, double-click to rewrite copy, drag to move, recolor from your brand palette. Every operation is logged with the exact source file and line (`client/src/surfaces/Landing.tsx:142`), the before/after values, and a machine-verifiable acceptance criterion.
3. **Agents close the loop.** Export the change log as Markdown or JSON, paste it into any coding agent, and the agent edits the real source — web first, then iOS/Android via per-surface `codeRefs` mappings.

## What you get

| Capability | Details |
|---|---|
| Infinite canvas | Zoom, pan, fit-all, workspace rails, flow-map arrows between screens |
| Device frames | iPhone-style bezel or desktop browser chrome, per `canvas.config.ts` |
| Visual editing | Inline text edit (bold/italic/line breaks), drag/move, resize, recolor, font swap, hide/show, delete, add elements, annotation pins |
| Brand guardrails | Palette from your config; off-palette colors flagged; copy lint for banned vocabulary; italics doctrine lint |
| Change log | Every op schema-validated (Zod), anchored to `file:line`, with acceptance criteria |
| Sessions | Save named review sessions; each captures exactly the delta since the last save |
| Exports | Copy/download JSON or agent-ready Markdown; optional prefilled GitHub issue |
| Play mode | Click buttons inside frames to travel the real navigation graph |
| Stress tests | One-click dark-mode preview and Dynamic Type (Aa+) stress test |
| iOS conversion | React → SwiftUI converter: `pnpm swift:export` generates pixel-faithful `.swift` views from computed-style snapshots |
| Xcode-style preview | `/ios/<surfaceId>` renders the generated SwiftUI in simulator chrome, side-by-side with the React simulation |
| Parity audit | `pnpm swift:parity` proves fonts, colors, sizes, placement, and images match the simulation exactly (±0.1pt) |
| Undo/redo | Unlimited, with full formatting fidelity (Ctrl+Z / Ctrl+Y / Ctrl+S) |
| Persistence | Local JSON file (`.canvas/state.json`) — no database, no accounts, no external services |

## Quick start

```bash
pnpm install
pnpm dev        # → http://localhost:3000
```

That's it. The repo ships with **Wavelength**, a fictional 14-screen demo app, so the canvas works out of the box. Replace the demo with your own screens when you're ready (see below).

## Onboard your own app

Three files define everything product-specific:

| File | What it holds |
|---|---|
| `canvas.config.ts` | Project name, brand tokens, fonts, banned vocabulary, workspaces, device frame, repo names |
| `shared/surface-inventory.json` | One entry per surface: id, workspace, route, nav edges, `codeRefs` per platform |
| `client/src/canvas/mounts.tsx` | Binds each surface id to the React component that renders it |

The workflow:

1. **Copy your screens** into `client/src/surfaces/` as plain React components (inline styles or your own CSS — no framework assumptions). Keep copy and layout verbatim with your production app.
2. **Register each surface** in `shared/surface-inventory.json` with its workspace, route, nav edges, and per-platform `codeRefs` (where the real web/iOS/Android source lives).
3. **Mount it** in `client/src/canvas/mounts.tsx`.
4. **Run the audit**: `pnpm audit:coverage` verifies unique ids, workspace membership, nav-graph resolution, and mount coverage.

This is deliberately agent-friendly work: point your coding agent at [`docs/onboarding.md`](docs/onboarding.md) and ask it to port your screens for you.

## The agent loop

```
┌────────────┐  visual edits   ┌──────────────┐  Markdown/JSON   ┌─────────────┐
│  Reviewer   │ ───────────────▶│ Change log    │ ────────────────▶│ Coding agent │
│ (canvas UI) │                 │ (file:line    │                  │ (Codex, ...) │
└────────────┘                 │  anchors)     │                  └──────┬──────┘
       ▲                        └──────────────┘                        │ edits
       │                                                                ▼
       │            pnpm dev (screens re-render from source)    ┌─────────────┐
       └────────────────────────────────────────────────────────│ Your repos   │
                                                                 │ web/iOS/droid│
                                                                 └─────────────┘
```

Every exported entry tells the agent **what** changed (property, before, after), **where** (source file and line in the canvas blueprint, plus `codeRefs` to each platform repo), and **how to verify** (a one-sentence acceptance criterion). See [`docs/export-format.md`](docs/export-format.md) for the full contract.

## iOS: convert, preview, prove parity

Click ** iOS** in the canvas toolbar (or open `/ios/<surfaceId>`) for an
Xcode-simulator-style view: the React simulation on the left, the generated
SwiftUI rendered in simulator chrome in the middle, and the `.swift` source
with a live **parity badge** on the right.

```bash
pnpm swift:export        # snapshot every surface → swift-out/<View>.swift (+ audit)
pnpm swift:parity        # re-verify font/color/size/placement/image parity
```

The converter works from a **computed-style snapshot** of the rendered surface
(with all canvas edits applied) — not from parsing your JSX — so what you see
is exactly what the Swift encodes. The audit fails CI-style (non-zero exit) on
any mismatch. Agent playbook: [`skills/ios-conversion/SKILL.md`](skills/ios-conversion/SKILL.md).

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the canvas (Express + Vite middleware, port `PORT` or 3000) |
| `pnpm check` | TypeScript typecheck |
| `pnpm test` | Vitest suite (101 tests: store fidelity, undo/redo, rich text, schema, swiftgen/parity, audit) |
| `pnpm audit:coverage` | Validate the surface inventory against mounts and nav graph |
| `pnpm swift:export` | Generate SwiftUI views from surface snapshots (playwright, or `--from-json` offline) |
| `pnpm swift:parity` | Audit generated Swift against snapshots — exact font/color/size/placement/image parity |
| `pnpm check:size` | Enforce the 600-line-per-file rule (keeps the repo agent-patchable) |

**Enable CI (one step):** copy [`docs/ci.yml.example`](docs/ci.yml.example) to `.github/workflows/ci.yml` in your fork/template copy — it runs all four gates on every push and PR.

## Docs

- [`docs/onboarding.md`](docs/onboarding.md) — port your own app's screens onto the canvas (agent-executable)
- [`docs/export-format.md`](docs/export-format.md) — the change-log schema and Markdown export contract
- [`docs/ios-workflow.md`](docs/ios-workflow.md) — driving a native SwiftUI codebase from canvas exports
- [`skills/ios-conversion/SKILL.md`](skills/ios-conversion/SKILL.md) — agent skill: convert surfaces to SwiftUI and prove parity
- [`AGENTS.md`](AGENTS.md) — instructions for coding agents working inside this repo

## Design principles

- **Zero external services.** No database, no auth, no API keys. State is a JSON file; exports are clipboard/download. The optional GitHub issue button uses a prefilled URL — no token.
- **The blueprint is disposable; the log is the product.** Canvas surfaces are lightweight vendored copies of your screens. The durable artifact is the change log that flows to your real repos.
- **Agent-sized files.** Every source file stays under 600 lines (CI-enforced) so agents can read and patch reliably.
- **Schema or it didn't happen.** Every change entry validates against a Zod schema before it's persisted or exported.

## License

[MIT](LICENSE)
