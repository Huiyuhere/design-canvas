/**
 * swift-export — generate SwiftUI views (+ parity audit) for surfaces.
 *
 * Usage:
 *   pnpm swift:export                     # all surfaces → swift-out/
 *   pnpm swift:export -- home settings    # specific surface ids
 *   pnpm swift:export -- --from-json dir  # offline: use snapshot JSONs
 *
 * How it works:
 *   1. Starts (or reuses) the dev server, opens each surface's /ios page in
 *      headless Chromium (playwright), and pulls the SurfaceSnapshot the page
 *      captures from the live DOM — computed styles, real layout boxes, with
 *      all canvas overrides applied. This IS the simulation's ground truth.
 *   2. Runs the generator (shared/swiftgen.ts) → swift-out/<View>.swift
 *   3. Runs the parity audit (shared/swiftparity.ts) and fails non-zero on
 *      any font/color/size/placement/image mismatch.
 *
 * No Xcode required. If playwright isn't installed, export snapshots from the
 * /ios/:surfaceId page in your browser (Download button) and re-run with
 * --from-json <dir>.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SURFACES } from "../client/src/canvas/registry";
import { generateSwift, viewNameFor } from "../shared/swiftgen";
import { auditParity, formatParityReport } from "../shared/swiftparity";
import { surfaceSnapshotSchema, type SurfaceSnapshot } from "../shared/uiSnapshot";

const OUT_DIR = "swift-out";
const args = process.argv.slice(2).filter((a) => a !== "--");

async function captureLive(ids: string[]): Promise<SurfaceSnapshot[]> {
  // playwright is an optional dev dependency — imported dynamically so the
  // repo works without it (offline --from-json mode).
  let chromium: { launch: () => Promise<PlaywrightBrowser> };
  try {
    ({ chromium } = (await import("playwright" as string)) as never);
  } catch {
    console.error(
      "playwright is not installed. Either:\n" +
        "  pnpm add -D playwright && pnpm exec playwright install chromium\n" +
        "or export snapshot JSONs from the /ios/:surfaceId page and run:\n" +
        "  pnpm swift:export -- --from-json <dir>",
    );
    process.exit(2);
  }
  const base = process.env.CANVAS_URL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const snaps: SurfaceSnapshot[] = [];
  for (const id of ids) {
    await page.goto(`${base}/ios/${id}`, { waitUntil: "networkidle" });
    // The page stores the captured snapshot on window.__fdSnapshot once ready.
    await page.waitForFunction(() => (window as never as { __fdSnapshot?: unknown }).__fdSnapshot, undefined, { timeout: 15000 });
    const snap = await page.evaluate(() => (window as never as { __fdSnapshot?: unknown }).__fdSnapshot);
    snaps.push(surfaceSnapshotSchema.parse(snap));
    console.log(`  captured ${id}`);
  }
  await browser.close();
  return snaps;
}

interface PlaywrightPage {
  goto: (url: string, opts?: { waitUntil?: string }) => Promise<unknown>;
  waitForFunction: (fn: () => unknown, arg?: unknown, opts?: { timeout?: number }) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
}
interface PlaywrightBrowser {
  newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<PlaywrightPage>;
  close: () => Promise<void>;
}

function loadFromJson(dir: string): SurfaceSnapshot[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => surfaceSnapshotSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

async function main() {
  let snaps: SurfaceSnapshot[];
  const fromJsonIdx = args.indexOf("--from-json");
  if (fromJsonIdx >= 0) {
    const dir = args[fromJsonIdx + 1];
    if (!dir || !existsSync(dir)) {
      console.error("--from-json requires an existing directory of snapshot JSONs");
      process.exit(2);
    }
    snaps = loadFromJson(dir);
  } else {
    const ids = args.length > 0 ? args : SURFACES.map((s) => s.id);
    const unknown = ids.filter((id) => !SURFACES.some((s) => s.id === id));
    if (unknown.length) {
      console.error(`Unknown surface ids: ${unknown.join(", ")}`);
      process.exit(2);
    }
    console.log(`Capturing ${ids.length} surface snapshot(s) from ${process.env.CANVAS_URL ?? "http://localhost:3000"} …`);
    snaps = await captureLive(ids);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const results = snaps.map((snap) => {
    const swift = generateSwift(snap);
    writeFileSync(join(OUT_DIR, `${viewNameFor(snap.surfaceId)}.swift`), swift);
    writeFileSync(join(OUT_DIR, `${snap.surfaceId}.snapshot.json`), JSON.stringify(snap, null, 2));
    const issues = auditParity(snap, swift);
    let textCount = 0;
    let imageCount = 0;
    const walk = (n: SurfaceSnapshot["root"]): void => {
      if (n.text !== null) textCount += 1;
      if (n.imageSrc) imageCount += 1;
      n.children.forEach(walk);
    };
    walk(snap.root);
    return { surfaceId: snap.surfaceId, issues, textCount, imageCount };
  });

  console.log(`\nWrote ${results.length} .swift file(s) to ${OUT_DIR}/\n`);
  console.log(formatParityReport(results));
  if (results.some((r) => r.issues.length > 0)) process.exit(1);
}

main();
