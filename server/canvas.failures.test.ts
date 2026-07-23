/**
 * Failure-case eval suite — F1..F21 from the build plan.
 * Each test names the failure case it catches. Unit level (store/schema/
 * registry/audit); interactive checks (F1/F9/F11/F12) are covered by the
 * mount-integrity + bounds + sync tests plus the manual screenshot review.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { changeEntrySchema, sessionEntrySchema, OPS } from "../shared/changeSchema";
import { BRAND_TOKENS, isOffPalette, lintCopy, normalizeColor } from "../shared/tokens";
import { CanvasStore } from "../client/src/canvas/store";
import { clampToFrame, FRAME_W, FRAME_H } from "../client/src/canvas/DeviceFrame";
import { SURFACES, WORKSPACES, allEdges, getSurface, surfacesByWorkspace } from "../client/src/canvas/registry";
import { getMount, MOUNTS } from "../client/src/canvas/mounts";

const ROOT = path.resolve(__dirname, "..");

function edit(store: CanvasStore, surface = "landing", el = "client/src/surfaces/Landing.tsx@142", before = "One introduction", after = "One dinner") {
  return store.applyOverride(surface, el, "edit", "text", before, after, { text: after }, { elementRole: "heading", componentName: "Landing" });
}

// ─── F1: surface fails to mount ───────────────────────────────────────────────
describe("F1 — every registry surface has a live mount", () => {
  it("has a mount for every inventory surface (no unmountable surface)", () => {
    const missing = SURFACES.filter((s) => !getMount(s.id));
    expect(missing.map((s) => s.id)).toEqual([]);
  });
  it("has no orphan mounts pointing at unknown surfaces", () => {
    const ids = new Set(SURFACES.map((s) => s.id));
    const orphans = Object.keys(MOUNTS).filter((k) => !ids.has(k));
    expect(orphans).toEqual([]);
  });
});

// ─── F2: copy drift — surface copy must match the source files verbatim ──────
describe("F2 — surface copy matches the source files verbatim", () => {
  const pairs: Array<[string, string]> = [
    ["client/src/surfaces/Landing.tsx", "Stay on the same"],
    ["client/src/surfaces/Landing.tsx", "No feed, no likes, no noise."],
    ["client/src/surfaces/Auth.tsx", "Create your account"],
  ];
  it.each(pairs)("%s contains exact copy %s", (file, phrase) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    expect(src.includes(phrase)).toBe(true);
  });
});

// ─── F3: wrong/empty before ──────────────────────────────────────────────────
describe("F3 — change entries carry the true before value", () => {
  it("records before and after distinctly", () => {
    const store = new CanvasStore();
    const entry = edit(store);
    expect(entry.before).toBe("One introduction");
    expect(entry.after).toBe("One dinner");
    expect(entry.before).not.toBe(entry.after);
  });
  it("second edit's before is the first edit's after (chained)", () => {
    const store = new CanvasStore();
    edit(store);
    const e2 = edit(store, "landing", "client/src/surfaces/Landing.tsx@142", "One dinner", "One table");
    expect(e2.before).toBe("One dinner");
  });
});

// ─── F4: drag spam — one gesture, one entry ──────────────────────────────────
describe("F4 — a move gesture produces exactly one entry", () => {
  it("single applyOverride(move) call → single log entry", () => {
    const store = new CanvasStore();
    store.applyOverride("landing", "el@1", "move", "position", { dx: 0, dy: 0 }, { dx: 40, dy: 12 }, { dx: 40, dy: 12 });
    expect(store.getState().changeLog).toHaveLength(1);
    expect(store.getState().changeLog[0].op).toBe("move");
  });
});

// ─── F5: undo orphans ────────────────────────────────────────────────────────
describe("F5 — N edits + N undos leaves an empty export", () => {
  it("round-trips to zero", () => {
    const store = new CanvasStore();
    edit(store);
    store.applyOverride("landing", "el@2", "edit", "color", "#111111", "#14655A", { color: "#14655A" });
    store.applyOverride("landing", "el@3", "move", "position", { dx: 0, dy: 0 }, { dx: 5, dy: 5 }, { dx: 5, dy: 5 });
    store.undoLast(); store.undoLast(); store.undoLast();
    expect(store.getState().changeLog).toHaveLength(0);
  });
  it("undo of delete restores visibility", () => {
    const store = new CanvasStore();
    store.deleteElement("landing", "el@9", { tag: "P", text: "gone" });
    expect(store.getState().overrides["landing::el@9"]?.hidden).toBe(true);
    store.undoLast();
    expect(store.getState().overrides["landing::el@9"]?.hidden).toBe(false);
    expect(store.getState().changeLog).toHaveLength(0);
  });
});

// ─── F6: source anchors ──────────────────────────────────────────────────────
describe("F6 — entries carry exact file:line anchors parsed from element ids", () => {
  it("parses sourceFile and line from the jsx-loc element id", () => {
    const store = new CanvasStore();
    const entry = edit(store);
    expect(entry.sourceFile).toBe("client/src/surfaces/Landing.tsx");
    expect(entry.line).toBe(142);
  });
  it("falls back to the surface sourceFile for non-anchored ids", () => {
    const store = new CanvasStore();
    const entry = store.applyOverride("landing", "custom-el", "edit", "text", "a", "b", { text: "b" });
    expect(entry.sourceFile).toBe(getSurface("landing")!.sourceFile);
  });
});

// ─── F7: off-palette colors flagged ──────────────────────────────────────────
describe("F7 — off-palette colors are flagged, brand tokens are not", () => {
  it("brand tokens pass", () => {
    for (const t of BRAND_TOKENS) expect(isOffPalette(t.hex)).toBe(false);
  });
  it("custom hex is flagged offPalette on the entry", () => {
    const store = new CanvasStore();
    const entry = store.applyOverride("landing", "el@5", "edit", "color", "#111111", "#00FF00", { color: "#00FF00" });
    expect(entry.offPalette).toBe(true);
  });
  it("accent #14655A is on-palette regardless of case", () => {
    expect(isOffPalette("#14655a")).toBe(false);
    expect(normalizeColor("#14655A")).toBe(normalizeColor("#14655a"));
  });
});

// ─── F8: corrupt storage guard ───────────────────────────────────────────────
describe("F8 — hydrate survives corrupted payloads", () => {
  it("hydrates cleanly from empty/partial/garbage data", () => {
    const store = new CanvasStore();
    expect(() => store.hydrate({})).not.toThrow();
    expect(() => store.hydrate({ changeLog: undefined, overrides: undefined })).not.toThrow();
    expect(store.getState().changeLog).toEqual([]);
  });
});

// ─── F9: drag is clamped to the frame bounds ─────────────────────────────────
describe("F9 — drag offsets are clamped so elements stay inside the frame", () => {
  const rect = { left: 100, top: 200, w: 120, h: 40 };
  it("dragging far right/down clamps to the frame edge", () => {
    const { dx, dy } = clampToFrame(9999, 9999, rect);
    expect(dx).toBe(FRAME_W - rect.left - rect.w); // 393-100-120 = 173
    expect(dy).toBe(FRAME_H - rect.top - rect.h);  // 852-200-40 = 612
  });
  it("dragging far left/up clamps to zero-origin", () => {
    const { dx, dy } = clampToFrame(-9999, -9999, rect);
    expect(dx).toBe(-rect.left);
    expect(dy).toBe(-rect.top);
  });
  it("in-bounds drags pass through unchanged", () => {
    expect(clampToFrame(10, -20, rect)).toEqual({ dx: 10, dy: -20 });
  });
});

// ─── Hide/show + annotate ops log correctly ──────────────────────────────────
describe("hide/show/annotate — visibility toggles and directives are logged", () => {
  it("hide sets hidden, show restores, both validate against schema", () => {
    const store = new CanvasStore();
    const h = store.applyOverride("landing", "el@8", "hide", "visibility", { hidden: false }, { hidden: true }, { hidden: true });
    expect(store.getState().overrides["landing::el@8"]?.hidden).toBe(true);
    const s = store.applyOverride("landing", "el@8", "show", "visibility", { hidden: true }, { hidden: false }, { hidden: false });
    expect(store.getState().overrides["landing::el@8"]?.hidden).toBe(false);
    for (const e of [h, s]) expect(() => changeEntrySchema.parse(e)).not.toThrow();
  });
  it("annotate entries carry the directive in after + notes", () => {
    const store = new CanvasStore();
    const e = store.applyOverride("landing", "el@9", "annotate", "annotation", null, "Increase tap target to 44pt", {}, { notes: "DIRECTIVE: Increase tap target to 44pt" });
    expect(e.op).toBe("annotate");
    expect(e.after).toBe("Increase tap target to 44pt");
    expect(e.notes).toContain("DIRECTIVE");
    expect(() => changeEntrySchema.parse(e)).not.toThrow();
  });
});

// ─── F10: duplicate ids are a build failure ──────────────────────────────────
describe("F10 — duplicate surface ids fail the audit (build failure)", () => {
  it("registry currently has zero duplicates", () => {
    const ids = SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── F13: delete carries a restorable snapshot ───────────────────────────────
describe("F13 — delete entries include deletedSnapshot and restore round-trips", () => {
  it("snapshot is stored on the entry", () => {
    const store = new CanvasStore();
    const snap = { tag: "BUTTON", text: "GET STARTED", cls: "cta" };
    const entry = store.deleteElement("landing", "el@77", snap);
    expect(entry.deletedSnapshot).toEqual(snap);
    expect(entry.op).toBe("delete");
  });
  it("deleting an inserted element removes it entirely", () => {
    const store = new CanvasStore();
    store.insertElement({ elementId: "ins-1", surfaceId: "landing", anchorElement: "el@1", kind: "note", text: "hi", color: "#111111", background: "#FFFFFF", fontSize: "12px", dx: 0, dy: 0 });
    store.deleteElement("landing", "ins-1", { kind: "note" });
    expect(store.getState().inserted["landing::ins-1"]).toBeUndefined();
  });
});

// ─── F14: added element spec is reproducible from the log alone ─────────────
describe("F14 — add entries carry a complete insertedSpec", () => {
  it("insertedSpec + anchorElement + position fully specify the addition", () => {
    const store = new CanvasStore();
    const spec = { elementId: "ins-2", surfaceId: "auth", anchorElement: "client/src/surfaces/Auth.tsx@40", kind: "button" as const, text: "JOIN WAITLIST", color: "#FFFFFF", background: "#14655A", fontSize: "13px", dx: 24, dy: 300 };
    const entry = store.insertElement(spec);
    expect(entry.insertedSpec).toEqual(spec);
    expect(entry.anchorElement).toBe(spec.anchorElement);
    expect(entry.position).toEqual({ dx: 24, dy: 300 });
    // An agent can reproduce: every visual property present
    const s = entry.insertedSpec as typeof spec;
    for (const kf of ["kind", "text", "color", "background", "fontSize", "dx", "dy"] as const) {
      expect(s[kf]).toBeDefined();
    }
  });
});

// ─── F15: nav graph resolves ─────────────────────────────────────────────────
describe("F15 — every nav edge resolves to a registered surface", () => {
  it("all edges resolve (or are toast pseudo-targets)", () => {
    const ids = new Set(SURFACES.map((s) => s.id));
    const bad = allEdges().filter((e) => !ids.has(e.to) && !e.to.startsWith("toast:"));
    expect(bad).toEqual([]);
  });
  it("toast pseudo-targets have a real toast surface behind them", () => {
    const hasToastEdges = allEdges().some((e) => e.to.startsWith("toast:"));
    if (hasToastEdges) expect(SURFACES.some((s) => s.type === "toast")).toBe(true);
  });
});

// ─── F16/F17/F18/F19: coverage audit script ──────────────────────────────────
describe("F16–F19 — scripts/audit-coverage.ts", () => {
  it("passes on the current registry (exit 0)", () => {
    const out = execFileSync("pnpm", ["exec", "tsx", "scripts/audit-coverage.ts", "--json"], { cwd: ROOT, encoding: "utf8" });
    const jsonStart = out.indexOf("{");
    const report = JSON.parse(out.slice(jsonStart));
    const failures = (report.findings ?? []).filter((f: { severity: string }) => f.severity === "fail");
    expect(failures).toEqual([]);
    expect(report.surfaces).toBe(SURFACES.length);
  }, 30000);
  it("workspace caps hold for every configured workspace", () => {
    expect(WORKSPACES.length).toBeGreaterThan(0);
    for (const w of WORKSPACES) {
      expect(surfacesByWorkspace(w.id).length).toBeLessThanOrEqual(w.cap);
    }
  });
  it("every surface belongs to exactly one known workspace", () => {
    const wsIds = new Set(WORKSPACES.map((w) => w.id));
    for (const s of SURFACES) expect(wsIds.has(s.workspace as never)).toBe(true);
  });
});

// ─── F20: session changeIds exactly cover the delta ─────────────────────────
describe("F20 — session entries exactly cover the delta since the last save", () => {
  it("changeIds match schema and partition the log", () => {
    const store = new CanvasStore();
    const e1 = edit(store);
    const e2 = edit(store, "auth", "client/src/surfaces/Auth.tsx@10", "x", "y");
    const s1 = store.saveSession("first");
    expect(sessionEntrySchema.parse(s1)).toBeTruthy();
    expect(s1.changeIds).toEqual([e1.id, e2.id]);
    expect(s1.changeCount).toBe(2);
    expect(s1.opsByType).toEqual({ edit: 2 });
    expect(s1.surfacesTouched.sort()).toEqual(["auth", "landing"]);
    const e3 = edit(store, "home", "client/src/surfaces/Home.tsx@22", "a", "b");
    const s2 = store.saveSession("second");
    expect(s2.changeIds).toEqual([e3.id]); // no overlap, no gap
    expect(s2.changeCount).toBe(1);
  });
});

// ─── F21: zero-change save is a no-op guard concern ──────────────────────────
describe("F21 — saving with zero changes produces an empty-delta entry the UI must guard", () => {
  it("delta is empty when nothing changed since last save", () => {
    const store = new CanvasStore();
    edit(store);
    store.saveSession("real");
    const empty = store.saveSession("accidental");
    expect(empty.changeCount).toBe(0);
    expect(empty.changeIds).toEqual([]);
  });
});

// ─── Schema integrity for every emitted entry ────────────────────────────────
describe("Schema — every store-emitted entry validates against changeEntrySchema", () => {
  it("edit/add/delete/move entries all parse", () => {
    const store = new CanvasStore();
    const entries = [
      edit(store),
      store.insertElement({ elementId: "i1", surfaceId: "landing", anchorElement: "el@1", kind: "text", text: "t", color: "#111111", background: "#F4F4F4", fontSize: "12px", dx: 1, dy: 2 }),
      store.deleteElement("landing", "el@2", { tag: "P" }),
      store.applyOverride("landing", "el@3", "move", "position", { dx: 0, dy: 0 }, { dx: 9, dy: 9 }, { dx: 9, dy: 9 }),
      store.applyOverride("landing", "el@4", "resize", "size", { w: 100, h: 40 }, { w: 200, h: 44 }, { w: 200, h: 44 }),
    ];
    for (const e of entries) expect(() => changeEntrySchema.parse(e)).not.toThrow();
    expect(OPS).toContain("edit");
  });
  it("copy lint annotates banned vocabulary in notes", () => {
    const banned = lintCopy("Click here for a world-class experience!");
    expect(banned.length).toBeGreaterThan(0);
    const store = new CanvasStore();
    const entry = store.applyOverride("landing", "el@6", "edit", "text", "old", "Click here for a world-class experience!", { text: "x" });
    expect(entry.notes).toContain("COPY LINT");
  });
});
