/**
 * audit-coverage.ts — inventory & mounts consistency audit for Design Canvas.
 *
 * Validates shared/surface-inventory.json against canvas.config.ts and the
 * mounts map so every surface renders and every nav edge resolves.
 *
 * FAILS (exit 1) on:
 *   A. Duplicate surface ids
 *   B. Unknown workspace          — surface.workspace not in canvas.config.ts
 *   C. Workspace cap exceeded     — more surfaces than the workspace's cap
 *   D. Unresolved nav target      — nav.to points at a surface id that does not exist (toast:* pseudo-targets allowed)
 *   E. Missing mount              — surface id has no entry in MOUNTS
 *   F. Missing source file        — sourceFile does not exist on disk
 * WARNS on:
 *   G. Orphan overlay/toast/state — non-screen surface without a parent
 *
 * Usage: pnpm audit:coverage [--json]
 */
import fs from "node:fs";
import path from "node:path";
import config from "../canvas.config";

const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..");

interface NavEdge { trigger: string; to: string }
interface InvSurface {
  id: string; workspace: string; type: string; name: string;
  route?: string; section?: string; parent?: string; sourceFile: string;
  codeRefs?: Record<string, string>; nav?: NavEdge[];
}
interface Finding { rule: string; severity: "fail" | "warn"; detail: string }

const findings: Finding[] = [];
const fail = (rule: string, detail: string) => findings.push({ rule, severity: "fail", detail });
const warn = (rule: string, detail: string) => findings.push({ rule, severity: "warn", detail });

const inv = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/surface-inventory.json"), "utf8")) as { surfaces: InvSurface[] };
const mountsSrc = fs.readFileSync(path.join(ROOT, "client/src/canvas/mounts.tsx"), "utf8");

const ids = new Set<string>();
const wsIds = new Set(config.workspaces.map((w) => w.id));
const perWs = new Map<string, number>();

for (const s of inv.surfaces) {
  // A. duplicates
  if (ids.has(s.id)) fail("A", `Duplicate surface id "${s.id}"`);
  ids.add(s.id);
  // B. workspace membership
  if (!wsIds.has(s.workspace)) fail("B", `Surface "${s.id}" references unknown workspace "${s.workspace}"`);
  perWs.set(s.workspace, (perWs.get(s.workspace) ?? 0) + 1);
  // E. mounts coverage (string check keeps this script dependency-free)
  const mountKeyPatterns = [`"${s.id}":`, `'${s.id}':`, `  ${s.id}:`, `\n${s.id}:`];
  if (!mountKeyPatterns.some((p) => mountsSrc.includes(p))) {
    fail("E", `Surface "${s.id}" has no entry in client/src/canvas/mounts.tsx`);
  }
  // F. source file exists
  if (!fs.existsSync(path.join(ROOT, s.sourceFile))) {
    fail("F", `Surface "${s.id}" sourceFile not found: ${s.sourceFile}`);
  }
  // G. orphan non-screens
  if (s.type !== "screen" && !s.parent) warn("G", `Surface "${s.id}" (${s.type}) has no parent`);
}

// C. caps
for (const w of config.workspaces) {
  const n = perWs.get(w.id) ?? 0;
  if (n > w.cap) fail("C", `Workspace "${w.id}" has ${n} surfaces (cap ${w.cap})`);
}

// D. nav resolution
for (const s of inv.surfaces) {
  for (const e of s.nav ?? []) {
    if (e.to.startsWith("toast:")) {
      if (!inv.surfaces.some((t) => t.type === "toast")) warn("D", `Surface "${s.id}" nav "${e.trigger}" → "${e.to}" but no toast-type surface exists`);
      continue;
    }
    if (!ids.has(e.to)) fail("D", `Surface "${s.id}" nav "${e.trigger}" → unknown target "${e.to}"`);
  }
}

const fails = findings.filter((f) => f.severity === "fail");
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ surfaces: inv.surfaces.length, workspaces: Object.fromEntries(perWs), findings }, null, 2));
} else {
  console.log(`\n━━━ Design Canvas Coverage Audit ━━━`);
  console.log(`Surfaces  : ${inv.surfaces.length}`);
  console.log(`Workspaces: ${[...perWs].map(([w, n]) => `${w}=${n}`).join("  ")}`);
  for (const f of findings) console.log(`  ${f.severity === "fail" ? "✗" : "⚠"} [${f.rule}] ${f.detail}`);
  console.log(fails.length ? `\nAUDIT FAILED — ${fails.length} failure(s).` : `\nAUDIT PASSED.`);
}
process.exit(fails.length ? 1 : 0);
