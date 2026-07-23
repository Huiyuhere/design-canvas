# iOS workflow — driving a SwiftUI codebase from canvas exports

The canvas renders web-technology blueprints, but the change log is platform-neutral: every surface carries a `codeRefs.ios` mapping, so a coding agent can apply the same reviewed changes to a native SwiftUI (or UIKit) codebase.

## Built-in React → SwiftUI converter (with parity proof)

The repo ships a full conversion pipeline — see [`skills/ios-conversion/SKILL.md`](../skills/ios-conversion/SKILL.md) for the agent playbook:

| Piece | Command / URL | What it does |
|---|---|---|
| Xcode-style preview | `/ios/<surfaceId>` | Side-by-side: React simulation, simulator-chrome render of the generated SwiftUI, the `.swift` source, and a live parity badge |
| Converter | `pnpm swift:export` | Captures a computed-style snapshot of each surface (all canvas edits applied) and generates `swift-out/<View>.swift` — a positioned ZStack that renders identically |
| Parity audit | `pnpm swift:parity` | Verifies the Swift output matches the snapshot **exactly**: font family/size/weight/italic, colors, box sizes, placement (±0.1pt), image URLs + fill modes. Non-zero exit on any drift |

The generated file is a pixel-faithful blueprint: use it directly to bootstrap
screens, or as the measured reference while writing idiomatic SwiftUI. The
change-log workflow below covers the complementary case — incremental edits
applied to an iOS codebase you already have.

## Setup

1. In `canvas.config.ts`, set `repos.ios` to your iOS repo (e.g. `your-org/yourapp-ios`).
2. In `shared/surface-inventory.json`, set `codeRefs.ios` on every surface that has a native counterpart (e.g. `"ios/App/Features/Home/HomeView.swift"`).
3. Exports now include an `iOS file` row per entry and a repo header pointing agents at the right repository.

## The translation loop

1. Review and edit screens on the canvas as usual; save a session.
2. Export the session as Markdown (`Copy Markdown` / `Download MD`).
3. Hand it to your coding agent with a prompt like:

   > Apply this Design Canvas change log to the iOS app. For each entry, open the file in the `iOS file` row, find the SwiftUI view corresponding to the anchored element (match on the `Before` copy or the element role), and apply the `Before → After` change idiomatically. Use exact copy and hex colors. Satisfy each entry's acceptance criterion. Do not change anything not in the log.

4. The agent maps web values to SwiftUI idioms:

| Canvas value | SwiftUI translation |
|---|---|
| `text` before/after | String literals / localized strings |
| Hex colors | `Color(hex:)` extension or asset-catalog color matching the brand token name |
| `fontFamily` / `fontSize` | `.font(.custom(_:size:))` mapped to your type scale |
| `position` `{dx, dy}` | Padding/offset adjustments in the surrounding stack |
| `hide` / `show` | Conditional rendering / `.opacity` / removal |
| `insertedSpec` | New view of the given `kind` (button/text/note) anchored near the `anchorElement`'s counterpart |
| `annotate` notes | Review directives — implement the instruction, not a literal pin |

## Keeping parity honest

- Treat brand token **names** (not raw hex) as the shared vocabulary between platforms; define the same tokens in your iOS design system.
- When a `before` value doesn't match the current Swift source, the code has drifted — reconcile before applying.
- Dynamic Type: the canvas's `Aa+` stress test approximates iOS accessibility sizes; entries produced in that mode deserve extra attention to `minimumScaleFactor` and line wrapping.
