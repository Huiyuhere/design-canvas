/**
 * swift-parity — standalone parity audit: verify existing .swift files in
 * swift-out/ still match their snapshot JSONs exactly on font, color, size,
 * placement, and images. Run after ANY hand edit to generated Swift, or in CI.
 *
 * Usage: pnpm swift:parity [-- dir]      (default dir: swift-out)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { viewNameFor } from "../shared/swiftgen";
import { auditParity, formatParityReport } from "../shared/swiftparity";
import { surfaceSnapshotSchema } from "../shared/uiSnapshot";

const dir = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "swift-out";
if (!existsSync(dir)) {
  console.error(`Directory ${dir} not found. Run \`pnpm swift:export\` first.`);
  process.exit(2);
}

const snapshotFiles = readdirSync(dir).filter((f) => f.endsWith(".snapshot.json"));
if (snapshotFiles.length === 0) {
  console.error(`No *.snapshot.json files in ${dir}. Run \`pnpm swift:export\` first.`);
  process.exit(2);
}

const results = snapshotFiles.map((f) => {
  const snap = surfaceSnapshotSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
  const swiftPath = join(dir, `${viewNameFor(snap.surfaceId)}.swift`);
  if (!existsSync(swiftPath)) {
    return {
      surfaceId: snap.surfaceId,
      issues: [{ surfaceId: snap.surfaceId, dimension: "structure" as const, element: "file", expected: swiftPath, actual: "missing" }],
      textCount: 0,
      imageCount: 0,
    };
  }
  const swift = readFileSync(swiftPath, "utf8");
  let textCount = 0;
  let imageCount = 0;
  const walk = (n: typeof snap.root): void => {
    if (n.text !== null) textCount += 1;
    if (n.imageSrc) imageCount += 1;
    n.children.forEach(walk);
  };
  walk(snap.root);
  return { surfaceId: snap.surfaceId, issues: auditParity(snap, swift), textCount, imageCount };
});

console.log(formatParityReport(results));
if (results.some((r) => r.issues.length > 0)) process.exit(1);

