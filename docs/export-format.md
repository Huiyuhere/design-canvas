# Change-log export format

This document is the contract between Design Canvas and any AI coding agent that applies exported changes to a real codebase. Exports come in two equivalent forms: **JSON** (raw entries) and **Markdown** (agent-optimized rendering of the same entries).

## The change entry

Every visual operation on the canvas produces one entry, validated by `changeEntrySchema` in `shared/changeSchema.ts` before persistence or export.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique id, e.g. `chg-01J...` |
| `timestamp` | ISO 8601 string | When the change was made |
| `op` | enum | `edit` · `add` · `delete` · `move` · `resize` · `hide` · `show` · `duplicate` · `annotate` |
| `workspace` | string | Workspace id the surface belongs to |
| `surface` | string | Surface id (see `shared/surface-inventory.json`) |
| `surfaceType` | enum | `screen` · `screen-state` · `overlay` · `interstitial` · `toast` |
| `elementId` | string | Element anchor: `<sourceFile>@<line>#<n>` for instrumented elements, `ins-*` for inserted ones |
| `elementRole` | string? | Human role: `heading`, `button`, `label`, … |
| `sourceFile` | string | Canvas blueprint file, e.g. `client/src/surfaces/Landing.tsx` |
| `line` | number? | Line number in `sourceFile` |
| `componentName` | string? | Component the element belongs to |
| `property` | string? | What changed: `text`, `color`, `background`, `fontFamily`, `fontSize`, `position`, `size`, `visibility`, `annotation` |
| `before` | any | Exact previous value (rich text keeps `<strong>/<em>/<br>` markup and `data-c` span colors) |
| `after` | any | Exact new value |
| `insertedSpec` | object? | For `add`: complete spec (`kind`, `text`, `color`, `background`, `fontSize`, `dx`, `dy`, `anchorElement`) — reproducible from the log alone |
| `anchorElement` | string? | Element the insertion is anchored to |
| `position` | `{dx, dy}`? | Offset for move/add ops, CSS px within the frame |
| `deletedSnapshot` | object? | For `delete`: restorable snapshot of the removed element |
| `offPalette` | boolean | `true` when a color is outside the brand tokens — needs human approval |
| `notes` | string? | Lint annotations (`COPY LINT: …`), reviewer directives (`DIRECTIVE: …`) |

## Sessions

`sessionEntrySchema` groups entries: `sessionId`, `label`, `savedAt`, `changeIds` (exactly the delta since the previous save — no overlap, no gap), `changeCount`, `opsByType`, `surfacesTouched`.

## Markdown export

The Markdown export renders one `##` section per entry with a field table plus two agent-critical additions:

1. **Repo header** — maps anchor paths to real repositories, from `canvas.config.ts`:
   > Web source repo: `your-org/wavelength-web` — `sourceFile:line` anchors and `codeRefs.web` paths are relative to it.
   > iOS source repo: `your-org/wavelength-ios` — `codeRefs.ios` paths are relative to it.
2. **Acceptance criteria** — one verifiable sentence per entry, e.g.:
   > The element at `client/src/surfaces/Landing.tsx:142` renders the exact text "One small signal a day." instead of "One small signal a day to the people who matter." on Landing.

## How an agent should apply an export

1. **Resolve the surface** via the `Surface` id → the export's `Web file` / `iOS file` / `Android file` rows (from the inventory's `codeRefs`) name the real files per platform.
2. **Apply to web first.** `sourceFile:line` anchors point into the canvas blueprint, which mirrors the web source; locate the same element in the production file (same copy/structure) and apply the `before → after` diff.
3. **Fan out to other platforms** using `codeRefs.ios` / `codeRefs.android`. Translate idiomatically (SwiftUI/Compose), preserving exact copy, colors, and spacing values.
4. **Respect flags.** `offPalette: true` requires explicit human sign-off. `COPY LINT` notes flag banned vocabulary — surface them, don't silently ship.
5. **Verify with the acceptance criterion** for each entry before marking it done.
6. **Never invent changes.** Only what's in the log; `before` values let you detect drift — if the code no longer matches `before`, stop and report the conflict.
