/**
 * SwiftUI generator — turns a SurfaceSnapshot (computed styles + layout boxes
 * captured from the live canvas) into a .swift file.
 *
 * Fidelity contract (checked by scripts/swift-parity.ts):
 *   - every text run keeps its exact string, font family, size, weight,
 *     italic, color, letter spacing, and alignment
 *   - every box keeps its exact frame position and size (absolute placement
 *     in a ZStack, coordinates in points = CSS px on the 393×852 frame)
 *   - every background, corner radius, border, and opacity survives
 *   - every image keeps its source URL (AsyncImage) and fill mode
 *
 * The output is deliberately literal: a positioned ZStack, not idiomatic
 * adaptive SwiftUI. It's a pixel-faithful starting point that compiles and
 * renders identically to the simulation; refactoring into stacks/spacers is
 * the coding agent's follow-up job (see skills/ios-conversion).
 */
import type { SnapshotNode, SurfaceSnapshot } from "./uiSnapshot";

function swiftString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** #RRGGBB or rgba(r,g,b,a) → Color(red:green:blue:opacity:) literal. */
export function swiftColor(css: string): string {
  const hex = css.match(/^#([0-9A-Fa-f]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    return `Color(red: ${round3(r)}, green: ${round3(g)}, blue: ${round3(b)})`;
  }
  const rgba = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgba) {
    const [r, g, b] = [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255];
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return `Color(red: ${round3(r)}, green: ${round3(g)}, blue: ${round3(b)}, opacity: ${round3(a)})`;
  }
  return `Color.black /* UNPARSED: ${css} */`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** CSS numeric weight → SwiftUI Font.Weight. */
export function swiftWeight(w: number): string {
  if (w <= 250) return ".ultraLight";
  if (w <= 350) return ".light";
  if (w <= 450) return ".regular";
  if (w <= 550) return ".medium";
  if (w <= 650) return ".semibold";
  if (w <= 750) return ".bold";
  if (w <= 850) return ".heavy";
  return ".black";
}

function fontExpr(n: SnapshotNode): string {
  const t = n.textStyle!;
  // Custom family keeps the exact rendered family; weight via .weight().
  let f = `.font(.custom(${swiftString(t.fontFamily)}, size: ${round1(t.fontSizePx)}))`;
  f += `\n            .fontWeight(${swiftWeight(t.fontWeight)})`;
  if (t.fontStyle === "italic") f += `\n            .italic()`;
  return f;
}

function textModifiers(n: SnapshotNode): string {
  const t = n.textStyle!;
  const mods: string[] = [fontExpr(n), `.foregroundColor(${swiftColor(t.color)})`];
  if (t.letterSpacingPx !== null && t.letterSpacingPx !== 0) mods.push(`.tracking(${round1(t.letterSpacingPx)})`);
  if (t.lineHeightPx !== null && t.lineHeightPx > t.fontSizePx) {
    mods.push(`.lineSpacing(${round1(t.lineHeightPx - t.fontSizePx * 1.2)})`);
  }
  const align = t.textAlign === "center" ? ".center" : t.textAlign === "right" ? ".trailing" : ".leading";
  mods.push(`.multilineTextAlignment(${align})`);
  if (t.textDecoration === "underline") mods.push(`.underline()`);
  if (t.textDecoration === "line-through") mods.push(`.strikethrough()`);
  return mods.map((m) => `            ${m}`).join("\n");
}

function displayText(n: SnapshotNode): string {
  const t = n.textStyle!;
  let s = n.text ?? "";
  if (t.textTransform === "uppercase") s = s.toUpperCase();
  if (t.textTransform === "lowercase") s = s.toLowerCase();
  return s;
}

function frameModifier(n: SnapshotNode): string {
  const { x, y, w, h } = n.box;
  return [
    `            .frame(width: ${round1(w)}, height: ${round1(h)}, alignment: .topLeading)`,
    `            .position(x: ${round1(x + w / 2)}, y: ${round1(y + h / 2)})`,
  ].join("\n");
}

function decorationModifiers(n: SnapshotNode): string[] {
  const mods: string[] = [];
  if (n.background) mods.push(`.background(${swiftColor(n.background)})`);
  if (n.borderRadiusPx > 0) mods.push(`.clipShape(RoundedRectangle(cornerRadius: ${round1(Math.min(n.borderRadiusPx, Math.min(n.box.w, n.box.h) / 2))}))`);
  if (n.border) {
    mods.push(
      `.overlay(RoundedRectangle(cornerRadius: ${round1(Math.min(n.borderRadiusPx, Math.min(n.box.w, n.box.h) / 2))}).stroke(${swiftColor(n.border.color)}, lineWidth: ${round1(n.border.widthPx)}))`,
    );
  }
  if (n.opacity < 1) mods.push(`.opacity(${round3(n.opacity)})`);
  return mods;
}

function emitNode(n: SnapshotNode, out: string[], anchorComment: boolean): void {
  const anchor = anchorComment && n.elementId ? ` // ${n.elementId}` : "";
  if (n.kind === "text" || n.kind === "button" || (n.kind === "input" && n.text)) {
    if (n.text !== null && n.textStyle) {
      out.push(`        Text(${swiftString(displayText(n))})${anchor}`);
      out.push(textModifiers(n));
      decorationModifiers(n).forEach((m) => out.push(`            ${m}`));
      out.push(frameModifier(n));
      return; // text leaf: children (formatting spans) already folded into text
    }
  }
  if (n.kind === "image" && n.imageSrc) {
    out.push(`        AsyncImage(url: URL(string: ${swiftString(n.imageSrc)})) { img in`);
    out.push(`            img.resizable().aspectRatio(contentMode: ${n.imageMode === "contain" ? ".fit" : ".fill"})`);
    out.push(`        } placeholder: { ${n.background ? swiftColor(n.background) : "Color.clear"} }${anchor}`);
    decorationModifiers(n).forEach((m) => out.push(`            ${m}`));
    out.push(frameModifier(n));
    return;
  }
  // Container (or input without text): emit its box when visually meaningful.
  const decorated = n.background || n.border || n.borderRadiusPx > 0;
  if (decorated) {
    out.push(`        RoundedRectangle(cornerRadius: ${round1(Math.min(n.borderRadiusPx, Math.min(n.box.w, n.box.h) / 2))})${anchor}`);
    out.push(`            .fill(${n.background ? swiftColor(n.background) : "Color.clear"})`);
    if (n.border) {
      out.push(`            .overlay(RoundedRectangle(cornerRadius: ${round1(Math.min(n.borderRadiusPx, Math.min(n.box.w, n.box.h) / 2))}).stroke(${swiftColor(n.border.color)}, lineWidth: ${round1(n.border.widthPx)}))`);
    }
    if (n.opacity < 1) out.push(`            .opacity(${round3(n.opacity)})`);
    out.push(frameModifier(n));
  }
  n.children.forEach((c) => emitNode(c, out, anchorComment));
}

export function viewNameFor(surfaceId: string): string {
  const pascal = surfaceId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
  return `${pascal}View`;
}

/** Generate a complete, compilable SwiftUI file from a snapshot. */
export function generateSwift(snap: SurfaceSnapshot, opts: { anchorComments?: boolean } = {}): string {
  const anchors = opts.anchorComments ?? true;
  const body: string[] = [];
  // Root background first (fills the whole device frame).
  if (snap.root.background) {
    body.push(`        ${swiftColor(snap.root.background)}`);
    body.push(`            .ignoresSafeArea()`);
  }
  snap.root.children.forEach((c) => emitNode(c, body, anchors));
  const name = viewNameFor(snap.surfaceId);
  return `// ${name}.swift
// Generated by Design Canvas swift-export from surface "${snap.surfaceId}" (${snap.surfaceName}).
// Snapshot: ${snap.capturedAt} · device ${snap.device.width}x${snap.device.height}pt
//
// PIXEL-FAITHFUL BLUEPRINT — positioned ZStack mirroring the canvas simulation
// exactly (fonts, colors, sizes, placement, images). Refactor into adaptive
// stacks with skills/ios-conversion once parity is verified (swift-parity.ts).
// DO NOT hand-edit values; re-export from the canvas instead.

import SwiftUI

struct ${name}: View {
    var body: some View {
        ZStack(alignment: .topLeading) {
${body.join("\n")}
        }
        .frame(width: ${snap.device.width}, height: ${snap.device.height})
        .clipped()
    }
}

#Preview {
    ${name}()
}
`;
}
