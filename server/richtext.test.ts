/**
 * Rich text round — shared/richtext.ts unit tests.
 * Covers: sanitization to strong/em/br subset, XSS stripping, plain↔rich
 * round-trips, textarea-editable conversion, and the italics doctrine lint.
 */
import { describe, it, expect } from "vitest";
import {
  isRichText, sanitizeRich, plainToRich, richToPlain,
  richToEditable, editableToRich, lintItalics, escapeHtml, balanceTags,
} from "../shared/richtext";

describe("isRichText", () => {
  it("detects strong/em/br markup", () => {
    expect(isRichText("hello <strong>x</strong>")).toBe(true);
    expect(isRichText("a<br>b")).toBe(true);
    expect(isRichText("plain text")).toBe(false);
    expect(isRichText("a < b and c > d")).toBe(false);
  });
});

describe("sanitizeRich", () => {
  it("keeps strong/em and converts br aliases", () => {
    expect(sanitizeRich("a<strong>b</strong><em>c</em>")).toBe("a<strong>b</strong><em>c</em>");
    expect(sanitizeRich("a<br/>b")).toBe("a<br>b");
  });
  it("normalises b/i to strong/em", () => {
    expect(sanitizeRich("<b>x</b> <i>y</i>")).toBe("<strong>x</strong> <em>y</em>");
  });
  it("strips scripts and other tags but keeps content", () => {
    expect(sanitizeRich('<script>alert(1)</script>hi')).toBe("alert(1)hi");
    expect(sanitizeRich('<span onclick="x()">safe</span>')).toBe("safe");
    expect(sanitizeRich('<img src=x onerror=alert(1)>t')).toBe("t");
  });
  it("drops attributes on allowed tags", () => {
    expect(sanitizeRich('<strong style="color:red">x</strong>')).toBe("<strong>x</strong>");
  });
  it("converts div/p boundaries to line breaks", () => {
    expect(sanitizeRich("line1<div>line2</div>")).toBe("line1<br>line2");
  });
  it("drops trailing br artefacts", () => {
    expect(sanitizeRich("hello<br>")).toBe("hello");
  });
  it("escapes stray angle brackets", () => {
    expect(sanitizeRich("2 &lt; 3")).toBe("2 &lt; 3");
  });
});

describe("plain/rich round-trips", () => {
  it("plainToRich escapes and converts newlines", () => {
    expect(plainToRich("a\nb")).toBe("a<br>b");
    expect(plainToRich('<tag> & "q"')).toBe("&lt;tag&gt; &amp; &quot;q&quot;");
  });
  it("richToPlain restores newlines and drops formatting", () => {
    expect(richToPlain("a<br>b")).toBe("a\nb");
    expect(richToPlain("<strong>x</strong> <em>y</em>")).toBe("x y");
  });
  it("richToEditable keeps literal tags, real newlines", () => {
    expect(richToEditable("23h 42m left<br><strong>bold</strong>")).toBe("23h 42m left\n<strong>bold</strong>");
  });
  it("editableToRich converts newlines to br and sanitizes", () => {
    expect(editableToRich("line1\nline2")).toBe("line1<br>line2");
    expect(editableToRich("<strong>b</strong>\n<script>x</script>")).toBe("<strong>b</strong><br>x");
  });
  it("round-trip is stable for a multi-line rich value", () => {
    const rich = "23 hours 42 minutes left<br>If it's going well, it says so.";
    expect(editableToRich(richToEditable(rich))).toBe(rich);
  });
});

describe("lintItalics — italicise a word, never a sentence", () => {
  it("allows up to 3 words", () => {
    expect(lintItalics("<em>ready</em>")).toHaveLength(0);
    expect(lintItalics("<em>one at a</em>")).toHaveLength(0);
  });
  it("flags whole-sentence italics", () => {
    const hits = lintItalics("<em>If it's going well, it says so.</em>");
    expect(hits).toHaveLength(1);
    expect(hits[0].reason).toContain("never a whole sentence");
  });
  it("checks each em span independently", () => {
    expect(lintItalics("<em>ready</em> and <em>this is a very long italic span</em>")).toHaveLength(1);
  });
});

describe("escapeHtml", () => {
  it("escapes the four critical characters", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});

describe("balanceTags — flicker root-cause fix (malformed markup)", () => {
  it("closes a real-world malformed value", () => {
    // "<strong>test</strong><strong>" — trailing unclosed opener never
    // round-tripped through the DOM identically → 600ms rewrite flicker
    expect(balanceTags("<strong>test</strong><strong>")).toBe("<strong>test</strong>");
  });
  it("drops unmatched closers", () => {
    expect(balanceTags("test</strong> more")).toBe("test more");
  });
  it("auto-closes unclosed openers with content", () => {
    expect(balanceTags("<strong>bold tail")).toBe("<strong>bold tail</strong>");
  });
  it("rebalances interleaved tags", () => {
    expect(balanceTags("<strong><em>x</strong></em>")).toBe("<strong><em>x</em></strong>");
  });
  it("removes empty spans", () => {
    expect(balanceTags("a<strong></strong>b<em></em>c")).toBe("abc");
  });
  it("is idempotent", () => {
    const once = balanceTags("<strong>test</strong><strong>");
    expect(balanceTags(once)).toBe(once);
  });
  it("sanitizeRich now normalises malformed input to a stable form", () => {
    const v = sanitizeRich("<strong>test</strong><strong>");
    expect(v).toBe("<strong>test</strong>");
    expect(sanitizeRich(v)).toBe(v);
  });
});

// ── Extended palette & brand fonts (config-driven) ───────────────────────────
import { EXTENDED_PALETTE, BRAND_FONTS, isOffPalette } from "../shared/tokens";

describe("extended palette & brand fonts", () => {
  it("extended palette entries are valid hex or rgba values", () => {
    for (const t of EXTENDED_PALETTE) expect(t.hex).toMatch(/^(#[0-9A-Fa-f]{6}|rgba?\([\d ,.%]+\))$/);
  });
  it("extended palette entries remain off-palette per strict brand-token check", () => {
    for (const t of EXTENDED_PALETTE) expect(isOffPalette(t.hex)).toBe(true);
  });
  it("brand fonts come from canvas.config.ts with css values", () => {
    expect(BRAND_FONTS.length).toBeGreaterThan(0);
    for (const f of BRAND_FONTS) expect(f.css.length).toBeGreaterThan(0);
  });
});
