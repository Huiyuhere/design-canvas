/**
 * Span-level colour — richtext data-c support.
 *
 * Feature: select a special (italic/bold) word in the Inspector and
 * recolour that word alone. Colour travels inside the text markup as a single
 * whitelisted attribute: <em data-c="#14655A">wouldn't</em>.
 *
 * These specs guard the three risk surfaces:
 *  1. XSS — sanitizeRich must keep ONLY a validated data-c on strong/em
 *  2. Flicker — serialisation must be idempotent (DOM round-trip byte-stable)
 *  3. Helper correctness — listSpans / setSpanColor drive the Inspector picker
 */
import { describe, expect, it } from "vitest";
import {
  sanitizeRich,
  balanceTags,
  listSpans,
  setSpanColor,
  normalizeHex,
  richToPlain,
  isRichText,
} from "../shared/richtext";

describe("normalizeHex", () => {
  it("accepts #RRGGBB and #RGB, normalises to uppercase 6-digit", () => {
    expect(normalizeHex("#14655a")).toBe("#14655A");
    expect(normalizeHex("14655a")).toBe("#14655A");
    expect(normalizeHex("#f4b")).toBe("#FF44BB");
  });
  // Regression: extended-palette swatches are rgba() strings —
  // they must flatten to solid hex over Parchment #F4F4F4, not be rejected.
  it("flattens rgba() swatches over Parchment to solid hex", () => {
    expect(normalizeHex("rgba(17,17,17,1)")).toBe("#111111");
    expect(normalizeHex("rgb(17, 17, 17)")).toBe("#111111");
    // Ink 55% over Parchment: 0.55*17 + 0.45*244 = 119.15 → 0x77
    expect(normalizeHex("rgba(17,17,17,0.55)")).toBe("#777777");
    // Ink 30% over Parchment: 0.30*17 + 0.70*244 = 175.9 → 0xB0
    expect(normalizeHex("rgba(17,17,17,0.30)")).toBe("#B0B0B0");
  });
  it("rejects 8-digit hex outright (never truncates #RRGGBBAA)", () => {
    expect(normalizeHex("#11111173")).toBeNull();
    expect(normalizeHex("11111173")).toBeNull();
  });
  it("rejects junk", () => {
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex('"><script>')).toBeNull();
    expect(normalizeHex("url(javascript:x)")).toBeNull();
    expect(normalizeHex("rgba(300,17,17,0.5)")).toBeNull();
  });
});

describe("sanitizeRich — data-c whitelist", () => {
  it("keeps a valid data-c on em and strong", () => {
    expect(sanitizeRich('You <em data-c="#14655A">wouldn\'t</em> date.'))
      .toBe('You <em data-c="#14655A">wouldn\'t</em> date.');
    expect(sanitizeRich('<strong data-c="#111111">signal</strong>'))
      .toBe('<strong data-c="#111111">signal</strong>');
  });
  it("normalises lowercase/3-digit hex and single quotes", () => {
    expect(sanitizeRich("<em data-c='#14655a'>x</em>")).toBe('<em data-c="#14655A">x</em>');
    expect(sanitizeRich('<em data-c="#f4b">x</em>')).toBe('<em data-c="#FF44BB">x</em>');
  });
  it("strips invalid data-c values", () => {
    expect(sanitizeRich('<em data-c="red">x</em>')).toBe("<em>x</em>");
    expect(sanitizeRich('<em data-c="javascript:alert(1)">x</em>')).toBe("<em>x</em>");
  });
  it("strips every other attribute, including style/onclick, keeping data-c", () => {
    expect(sanitizeRich('<em style="color:red" onclick="x()" data-c="#14655A">x</em>'))
      .toBe('<em data-c="#14655A">x</em>');
    expect(sanitizeRich('<em onmouseover="steal()">x</em>')).toBe("<em>x</em>");
  });
  it("still strips non-whitelisted tags entirely", () => {
    expect(sanitizeRich('<span data-c="#14655A">x</span>')).toBe("x");
    expect(sanitizeRich('<script>alert(1)</script>hi')).toBe("alert(1)hi");
  });
  it("is idempotent with colour spans (no re-apply flicker)", () => {
    const v = 'You <em data-c="#14655A">wouldn\'t</em> date.<br><strong data-c="#4A4A4A">bold</strong>';
    const once = sanitizeRich(v);
    expect(sanitizeRich(once)).toBe(once);
  });
  it("balances unclosed coloured spans without losing the colour", () => {
    const out = sanitizeRich('a <em data-c="#14655A">b');
    expect(out).toBe('a <em data-c="#14655A">b</em>');
  });
  it("drops empty coloured spans", () => {
    expect(sanitizeRich('a <em data-c="#14655A"></em>b')).toBe("a b");
  });
});

describe("balanceTags — attribute-aware", () => {
  it("rebalances interleaved tags preserving the coloured opener", () => {
    const out = balanceTags('<strong>a <em data-c="#14655A">b</strong> c</em>');
    // em is closed before strong closes, then reopened with its colour
    expect(out).toBe('<strong>a <em data-c="#14655A">b</em></strong><em data-c="#14655A"> c</em>');
  });
});

describe("listSpans", () => {
  it("lists formatted spans in order with tag, text, colour", () => {
    const spans = listSpans('You <em>wouldn\'t</em> date <strong data-c="#14655A">ever</strong>.');
    expect(spans).toEqual([
      { index: 0, tag: "em", text: "wouldn't", color: null },
      { index: 1, tag: "strong", text: "ever", color: "#14655A" },
    ]);
  });
  it("returns empty for plain text", () => {
    expect(listSpans("no formatting here")).toEqual([]);
  });
});

describe("setSpanColor", () => {
  const base = 'You <em>wouldn\'t</em> date <strong>ever</strong>.';
  it("colours only the targeted span", () => {
    expect(setSpanColor(base, 0, "#14655A"))
      .toBe('You <em data-c="#14655A">wouldn\'t</em> date <strong>ever</strong>.');
    expect(setSpanColor(base, 1, "#14655a"))
      .toBe('You <em>wouldn\'t</em> date <strong data-c="#14655A">ever</strong>.');
  });
  it("accepts rgba() swatch input (extended palette), flattened to hex", () => {
    expect(setSpanColor(base, 0, "rgba(17,17,17,0.55)"))
      .toBe('You <em data-c="#777777">wouldn\'t</em> date <strong>ever</strong>.');
  });
  it("no-ops on 8-digit hex instead of writing a malformed data-c", () => {
    expect(setSpanColor(base, 0, "#11111173")).toBe(base);
  });
  it("replaces an existing colour", () => {
    const once = setSpanColor(base, 0, "#14655A");
    expect(setSpanColor(once, 0, "#111111"))
      .toBe('You <em data-c="#111111">wouldn\'t</em> date <strong>ever</strong>.');
  });
  it("clears with null", () => {
    const once = setSpanColor(base, 0, "#14655A");
    expect(setSpanColor(once, 0, null)).toBe(base);
  });
  it("no-ops on invalid hex or out-of-range index", () => {
    expect(setSpanColor(base, 0, "nope")).toBe(base);
    expect(setSpanColor(base, 9, "#14655A")).toBe(base);
  });
  it("round-trips through sanitizeRich unchanged", () => {
    const coloured = setSpanColor(base, 0, "#14655A");
    expect(sanitizeRich(coloured)).toBe(coloured);
  });
});

describe("compatibility with existing helpers", () => {
  it("richToPlain drops coloured tags cleanly", () => {
    expect(richToPlain('You <em data-c="#14655A">wouldn\'t</em> date.'))
      .toBe("You wouldn't date.");
  });
  it("isRichText detects coloured spans", () => {
    expect(isRichText('<em data-c="#14655A">x</em>')).toBe(true);
  });
});
