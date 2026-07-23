/**
 * swiftgen + swiftparity — converter/audit correctness.
 * Round-trip: generate Swift from a snapshot, audit it → zero issues.
 * Mutation: corrupt any audited dimension in the Swift → audit catches it.
 */
import { describe, expect, it } from "vitest";
import { generateSwift, swiftColor, swiftWeight, viewNameFor } from "../shared/swiftgen";
import { auditParity } from "../shared/swiftparity";
import { normalizeColor, type SnapshotNode, type SurfaceSnapshot } from "../shared/uiSnapshot";

function textNode(over: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    elementId: "Home.tsx@10#1",
    kind: "text",
    tag: "h1",
    text: "Good morning",
    box: { x: 24, y: 96, w: 200, h: 42 },
    background: null,
    imageSrc: null,
    imageMode: null,
    borderRadiusPx: 0,
    border: null,
    opacity: 1,
    zIndex: 0,
    textStyle: {
      fontFamily: "Georgia",
      fontSizePx: 32,
      fontWeight: 400,
      fontStyle: "normal",
      color: "#16161A",
      letterSpacingPx: -0.5,
      lineHeightPx: 42,
      textAlign: "left",
      textDecoration: "none",
      textTransform: "none",
    },
    children: [],
    ...over,
  };
}

function makeSnapshot(children: SnapshotNode[]): SurfaceSnapshot {
  return {
    surfaceId: "home",
    surfaceName: "Home",
    capturedAt: "2026-07-22T00:00:00.000Z",
    device: { width: 393, height: 852 },
    root: {
      elementId: null,
      kind: "container",
      tag: "div",
      text: null,
      box: { x: 0, y: 0, w: 393, h: 852 },
      background: "#F6F5F1",
      imageSrc: null,
      imageMode: null,
      borderRadiusPx: 0,
      border: null,
      opacity: 1,
      zIndex: 0,
      textStyle: null,
      children,
    },
  };
}

const imageNode: SnapshotNode = {
  elementId: "Home.tsx@22#1",
  kind: "image",
  tag: "img",
  text: null,
  box: { x: 24, y: 200, w: 345, h: 180 },
  background: null,
  imageSrc: "https://example.com/hero.jpg",
  imageMode: "cover",
  borderRadiusPx: 18,
  border: null,
  opacity: 1,
  zIndex: 0,
  textStyle: null,
  children: [],
};

const buttonNode = textNode({
  elementId: "Home.tsx@30#1",
  kind: "button",
  tag: "button",
  text: "Send a signal",
  box: { x: 24, y: 700, w: 345, h: 52 },
  background: "#16161A",
  borderRadiusPx: 100,
  textStyle: {
    fontFamily: "Nunito",
    fontSizePx: 12,
    fontWeight: 800,
    fontStyle: "normal",
    color: "#FFFFFF",
    letterSpacingPx: 1.4,
    lineHeightPx: null,
    textAlign: "center",
    textDecoration: "none",
    textTransform: "uppercase",
  },
});

describe("swiftgen", () => {
  it("names views in PascalCase with View suffix", () => {
    expect(viewNameFor("home")).toBe("HomeView");
    expect(viewNameFor("circle-detail")).toBe("CircleDetailView");
    expect(viewNameFor("onboarding-2")).toBe("Onboarding2View");
  });

  it("converts hex and rgba colors to SwiftUI Color literals", () => {
    expect(swiftColor("#FFFFFF")).toBe("Color(red: 1, green: 1, blue: 1)");
    expect(swiftColor("#16161A")).toContain("blue: 0.102");
    expect(swiftColor("rgba(22,22,26,0.45)")).toContain("opacity: 0.45");
  });

  it("maps CSS weights to Font.Weight", () => {
    expect(swiftWeight(400)).toBe(".regular");
    expect(swiftWeight(700)).toBe(".bold");
    expect(swiftWeight(800)).toBe(".heavy");
  });

  it("emits a compilable view struct with exact text, font, position, and image", () => {
    const swift = generateSwift(makeSnapshot([textNode(), imageNode, buttonNode]));
    expect(swift).toContain("struct HomeView: View");
    expect(swift).toContain('Text("Good morning")');
    expect(swift).toContain('.font(.custom("Georgia", size: 32))');
    // uppercase textTransform is baked into the literal
    expect(swift).toContain('Text("SEND A SIGNAL")');
    // placement: center of 24,96 200x42 → (124, 117)
    expect(swift).toContain(".position(x: 124, y: 117)");
    expect(swift).toContain('AsyncImage(url: URL(string: "https://example.com/hero.jpg"))');
    expect(swift).toContain("#Preview");
  });
});

describe("swiftparity", () => {
  const snap = makeSnapshot([textNode(), imageNode, buttonNode]);

  it("round-trip: generated Swift passes with zero issues", () => {
    expect(auditParity(snap, generateSwift(snap))).toEqual([]);
  });

  it("catches font size drift", () => {
    const bad = generateSwift(snap).replace('size: 32', 'size: 30');
    const issues = auditParity(snap, bad);
    expect(issues.some((i) => i.dimension === "font")).toBe(true);
  });

  it("catches color drift", () => {
    const bad = generateSwift(snap).replace("Color(red: 1, green: 1, blue: 1)", "Color(red: 0.9, green: 1, blue: 1)");
    expect(auditParity(snap, bad).some((i) => i.dimension === "color")).toBe(true);
  });

  it("catches placement drift beyond 0.1pt", () => {
    const bad = generateSwift(snap).replace(".position(x: 124, y: 117)", ".position(x: 124, y: 119)");
    expect(auditParity(snap, bad).some((i) => i.dimension === "placement")).toBe(true);
  });

  it("catches a missing text run", () => {
    const bad = generateSwift(snap).replace('Text("Good morning")', 'Text("Good evening")');
    expect(auditParity(snap, bad).some((i) => i.dimension === "text")).toBe(true);
  });

  it("catches image mode and source drift", () => {
    const badMode = generateSwift(snap).replace("contentMode: .fill", "contentMode: .fit");
    expect(auditParity(snap, badMode).some((i) => i.dimension === "image")).toBe(true);
    const badSrc = generateSwift(snap).replace("hero.jpg", "other.jpg");
    expect(auditParity(snap, badSrc).some((i) => i.dimension === "image")).toBe(true);
  });
});

describe("normalizeColor", () => {
  it("normalizes rgb() to #RRGGBB and preserves alpha", () => {
    expect(normalizeColor("rgb(246, 245, 241)")).toBe("#F6F5F1");
    expect(normalizeColor("rgba(22, 22, 26, 0.45)")).toBe("rgba(22,22,26,0.45)");
    expect(normalizeColor("rgba(0, 0, 0, 0)")).toBeNull();
  });
});
