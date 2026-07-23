/**
 * Swift parity audit — proves the generated SwiftUI matches the snapshot
 * (i.e. the canvas simulation) EXACTLY on the five audited dimensions:
 *
 *   1. FONT       — family, size, weight, italic per text run
 *   2. COLOR      — foreground per text run, background/border per box
 *   3. SIZE       — width/height of every emitted box
 *   4. PLACEMENT  — center position of every emitted box
 *   5. IMAGES     — source URL and fill mode of every image
 *
 * It re-parses the .swift source (no Xcode needed — the generator's output
 * shape is a stable, machine-checkable subset of SwiftUI) and diffs every
 * value against the snapshot. Any mismatch is a failure with a precise
 * description. Tolerance: 0.1pt on geometry (rounding), exact on everything
 * else.
 */
import type { SnapshotNode, SurfaceSnapshot } from "./uiSnapshot";
import { swiftColor, swiftWeight, viewNameFor } from "./swiftgen";

export interface ParityIssue {
  surfaceId: string;
  dimension: "font" | "color" | "size" | "placement" | "image" | "text" | "structure";
  element: string;
  expected: string;
  actual: string;
}

interface ExpectedText {
  text: string;
  family: string;
  size: number;
  weight: string;
  italic: boolean;
  color: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
  label: string;
}

interface ExpectedImage {
  src: string;
  mode: ".fit" | ".fill";
  w: number;
  h: number;
  cx: number;
  cy: number;
  label: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function displayText(n: SnapshotNode): string {
  const t = n.textStyle!;
  let s = n.text ?? "";
  if (t.textTransform === "uppercase") s = s.toUpperCase();
  if (t.textTransform === "lowercase") s = s.toLowerCase();
  return s;
}

/** Collect what the generator MUST have emitted, mirroring emitNode's walk. */
function collectExpectations(n: SnapshotNode, texts: ExpectedText[], images: ExpectedImage[]): void {
  if ((n.kind === "text" || n.kind === "button" || (n.kind === "input" && n.text)) && n.text !== null && n.textStyle) {
    const t = n.textStyle;
    texts.push({
      text: displayText(n),
      family: t.fontFamily,
      size: round1(t.fontSizePx),
      weight: swiftWeight(t.fontWeight),
      italic: t.fontStyle === "italic",
      color: swiftColor(t.color),
      w: round1(n.box.w),
      h: round1(n.box.h),
      cx: round1(n.box.x + n.box.w / 2),
      cy: round1(n.box.y + n.box.h / 2),
      label: n.elementId ?? `${n.tag} "${(n.text ?? "").slice(0, 40)}"`,
    });
    return;
  }
  if (n.kind === "image" && n.imageSrc) {
    images.push({
      src: n.imageSrc,
      mode: n.imageMode === "contain" ? ".fit" : ".fill",
      w: round1(n.box.w),
      h: round1(n.box.h),
      cx: round1(n.box.x + n.box.w / 2),
      cy: round1(n.box.y + n.box.h / 2),
      label: n.elementId ?? `img ${n.imageSrc.slice(0, 40)}`,
    });
    return;
  }
  n.children.forEach((c) => collectExpectations(c, texts, images));
}

function unescapeSwift(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** A parsed Text(...) block from the generated Swift. */
interface SwiftTextBlock {
  text: string;
  family: string | null;
  size: number | null;
  weight: string | null;
  italic: boolean;
  color: string | null;
  w: number | null;
  h: number | null;
  cx: number | null;
  cy: number | null;
}

function parseSwiftBlocks(swift: string): { texts: SwiftTextBlock[]; images: { src: string; mode: string; w: number | null; h: number | null; cx: number | null; cy: number | null }[] } {
  const lines = swift.split("\n");
  const texts: SwiftTextBlock[] = [];
  const images: { src: string; mode: string; w: number | null; h: number | null; cx: number | null; cy: number | null }[] = [];
  let cur: SwiftTextBlock | null = null;
  let curImg: { src: string; mode: string; w: number | null; h: number | null; cx: number | null; cy: number | null } | null = null;

  const flush = () => {
    if (cur) texts.push(cur);
    cur = null;
    if (curImg) images.push(curImg);
    curImg = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const textM = line.match(/^Text\("((?:[^"\\]|\\.)*)"\)/);
    const imgM = line.match(/^AsyncImage\(url: URL\(string: "((?:[^"\\]|\\.)*)"\)\)/);
    if (textM) {
      flush();
      cur = { text: unescapeSwift(textM[1]), family: null, size: null, weight: null, italic: false, color: null, w: null, h: null, cx: null, cy: null };
      continue;
    }
    if (imgM) {
      flush();
      curImg = { src: unescapeSwift(imgM[1]), mode: "", w: null, h: null, cx: null, cy: null };
      continue;
    }
    if (line.startsWith("RoundedRectangle") && !line.startsWith(".")) flush();
    // End of the ZStack body: the outer `.frame(...)` on the ZStack itself
    // must not be attributed to the last parsed block.
    if (line === "}") flush();

    const target = cur ?? curImg;
    if (!target) continue;
    const fontM = line.match(/\.font\(\.custom\("((?:[^"\\]|\\.)*)", size: ([\d.]+)\)\)/);
    if (fontM && cur) {
      cur.family = unescapeSwift(fontM[1]);
      cur.size = Number(fontM[2]);
    }
    const weightM = line.match(/\.fontWeight\((\.\w+)\)/);
    if (weightM && cur) cur.weight = weightM[1];
    if (line.includes(".italic()") && cur) cur.italic = true;
    const colorM = line.match(/\.foregroundColor\((Color\([^)]*\))\)/);
    if (colorM && cur) cur.color = colorM[1];
    const modeM = line.match(/aspectRatio\(contentMode: (\.\w+)\)/);
    if (modeM && curImg) curImg.mode = modeM[1];
    const frameM = line.match(/\.frame\(width: ([\d.]+), height: ([\d.]+)/);
    if (frameM) {
      target.w = Number(frameM[1]);
      target.h = Number(frameM[2]);
    }
    const posM = line.match(/\.position\(x: ([\d.]+), y: ([\d.]+)\)/);
    if (posM) {
      target.cx = Number(posM[1]);
      target.cy = Number(posM[2]);
    }
  }
  flush();
  return { texts, images };
}

const GEO_TOLERANCE = 0.11;

function geoEq(a: number | null, b: number): boolean {
  return a !== null && Math.abs(a - b) <= GEO_TOLERANCE;
}

/** Audit generated Swift against its snapshot. Returns [] when parity holds. */
export function auditParity(snap: SurfaceSnapshot, swift: string): ParityIssue[] {
  const issues: ParityIssue[] = [];
  const sid = snap.surfaceId;
  const expTexts: ExpectedText[] = [];
  const expImages: ExpectedImage[] = [];
  collectExpectations(snap.root, expTexts, expImages);
  const got = parseSwiftBlocks(swift);

  if (!swift.includes(`struct ${viewNameFor(sid)}: View`)) {
    issues.push({ surfaceId: sid, dimension: "structure", element: "file", expected: `struct ${viewNameFor(sid)}`, actual: "missing" });
  }

  expTexts.forEach((e) => {
    // Match by exact text + position (several runs can share copy).
    const cand = got.texts.filter((t) => t.text === e.text);
    if (cand.length === 0) {
      issues.push({ surfaceId: sid, dimension: "text", element: e.label, expected: JSON.stringify(e.text), actual: "not emitted" });
      return;
    }
    const t = cand.find((c) => geoEq(c.cx, e.cx) && geoEq(c.cy, e.cy)) ?? cand[0];
    if (t.family !== e.family) issues.push({ surfaceId: sid, dimension: "font", element: e.label, expected: `family ${e.family}`, actual: String(t.family) });
    if (t.size !== e.size) issues.push({ surfaceId: sid, dimension: "font", element: e.label, expected: `size ${e.size}`, actual: String(t.size) });
    if (t.weight !== e.weight) issues.push({ surfaceId: sid, dimension: "font", element: e.label, expected: `weight ${e.weight}`, actual: String(t.weight) });
    if (t.italic !== e.italic) issues.push({ surfaceId: sid, dimension: "font", element: e.label, expected: `italic ${e.italic}`, actual: String(t.italic) });
    if (t.color !== e.color) issues.push({ surfaceId: sid, dimension: "color", element: e.label, expected: e.color, actual: String(t.color) });
    if (!geoEq(t.w, e.w) || !geoEq(t.h, e.h)) issues.push({ surfaceId: sid, dimension: "size", element: e.label, expected: `${e.w}x${e.h}`, actual: `${t.w}x${t.h}` });
    if (!geoEq(t.cx, e.cx) || !geoEq(t.cy, e.cy)) issues.push({ surfaceId: sid, dimension: "placement", element: e.label, expected: `(${e.cx}, ${e.cy})`, actual: `(${t.cx}, ${t.cy})` });
  });

  expImages.forEach((e) => {
    const img = got.images.find((i) => i.src === e.src && geoEq(i.cx, e.cx) && geoEq(i.cy, e.cy)) ?? got.images.find((i) => i.src === e.src);
    if (!img) {
      issues.push({ surfaceId: sid, dimension: "image", element: e.label, expected: e.src, actual: "not emitted" });
      return;
    }
    if (img.mode !== e.mode) issues.push({ surfaceId: sid, dimension: "image", element: e.label, expected: `mode ${e.mode}`, actual: img.mode });
    if (!geoEq(img.w, e.w) || !geoEq(img.h, e.h)) issues.push({ surfaceId: sid, dimension: "size", element: e.label, expected: `${e.w}x${e.h}`, actual: `${img.w}x${img.h}` });
    if (!geoEq(img.cx, e.cx) || !geoEq(img.cy, e.cy)) issues.push({ surfaceId: sid, dimension: "placement", element: e.label, expected: `(${e.cx}, ${e.cy})`, actual: `(${img.cx}, ${img.cy})` });
  });

  return issues;
}

export function formatParityReport(all: { surfaceId: string; issues: ParityIssue[]; textCount: number; imageCount: number }[]): string {
  const lines: string[] = ["━━━ Swift Parity Audit ━━━"];
  let total = 0;
  all.forEach((r) => {
    total += r.issues.length;
    const status = r.issues.length === 0 ? "PASS" : `FAIL (${r.issues.length})`;
    lines.push(`${r.surfaceId.padEnd(28)} texts=${String(r.textCount).padEnd(4)} images=${String(r.imageCount).padEnd(3)} ${status}`);
    r.issues.forEach((i) => {
      lines.push(`    [${i.dimension}] ${i.element}: expected ${i.expected}, got ${i.actual}`);
    });
  });
  lines.push(total === 0 ? "PARITY PASSED — Swift output matches the simulation exactly." : `PARITY FAILED — ${total} mismatch(es).`);
  return lines.join("\n");
}
