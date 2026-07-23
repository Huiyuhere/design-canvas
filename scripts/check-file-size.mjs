/**
 * check-file-size.mjs — enforces the 600-line-per-file rule.
 *
 * Big files are where agent edits go wrong. Keeping every source file under
 * 600 lines keeps the whole repo greppable and safely patchable by both
 * humans and coding agents.
 *
 * Usage: pnpm check:size
 */
import fs from "node:fs";
import path from "node:path";

const LIMIT = 600;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIRS = ["client/src", "server", "shared", "scripts"];
const EXT = /\.(ts|tsx|mjs|css)$/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXT.test(entry.name)) yield full;
  }
}

let failed = false;
for (const d of DIRS) {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const lines = fs.readFileSync(file, "utf8").split("\n").length;
    if (lines > LIMIT) {
      console.error(`✗ ${path.relative(ROOT, file)} — ${lines} lines (limit ${LIMIT})`);
      failed = true;
    }
  }
}
console.log(failed ? "\ncheck:size FAILED — split the files above." : "check:size passed — all files under 600 lines.");
process.exit(failed ? 1 : 0);
