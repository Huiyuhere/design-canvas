/**
 * Rich text helpers — Design Canvas.
 *
 * Overrides store text as "safe markup": plain text where the ONLY allowed
 * tags are <strong>, <em>, <b>, <i> (normalised to strong/em) and <br>.
 * Everything else is escaped. This keeps the change log human-readable and
 * the DOM patch XSS-safe.
 *
 * Span colour: a <strong>/<em> may carry exactly one attribute,
 * data-c="#RRGGBB" (validated hex, lowercase-normalised to #UPPERCASE form
 * `data-c="#14655A"`), which the canvas renders as an inline colour on that
 * span only. Every other attribute is stripped.
 */

/** True if the value contains any rich markup we render via innerHTML. */
export function isRichText(value: string): boolean {
  return /<(strong|em|br)\b/i.test(value);
}

/** Validate + normalise a hex colour for data-c (#RGB or #RRGGBB → #RRGGBB uppercase). */
export function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim();
  // rgba(17,17,17,0.45)-style swatches (Muted Ink / Eyebrow / extended palette)
  // are flattened to a solid hex composited over Parchment #F4F4F4 — the
  // universal screen background — because data-c carries opaque hex only.
  // Truncating to #RRGGBBAA (the old failure mode: "#11111173") is never done.
  const rgba = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0?\.\d+|[01](?:\.0*)?)\s*)?\)$/i.exec(trimmed);
  if (rgba) {
    const [r, g, b] = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
    if ([r, g, b].some((v) => v > 255)) return null;
    const a = rgba[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgba[4])));
    const BG = [244, 244, 244]; // Parchment
    const toHex = (c: number, bg: number) =>
      Math.round(a * c + (1 - a) * bg).toString(16).padStart(2, "0");
    return `#${toHex(r, BG[0])}${toHex(g, BG[1])}${toHex(b, BG[2])}`.toUpperCase();
  }
  // Strict 3/6-digit hex; 8-digit (#RRGGBBAA) is rejected outright.
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(trimmed);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

/**
 * Normalise an allowed-tag opening: keep only a valid data-c attribute.
 * Returns e.g. `<em>` or `<em data-c="#14655A">`.
 */
function normalizeOpenTag(tag: string, attrs: string | undefined): string {
  if (!attrs) return `<${tag}>`;
  const m = /data-c\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const hex = m ? normalizeHex(m[1] ?? m[2] ?? m[3] ?? "") : null;
  return hex ? `<${tag} data-c="${hex}">` : `<${tag}>`;
}

/** Escape a plain-text chunk for safe HTML insertion. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sanitize arbitrary HTML down to the safe subset: strong/em/br only.
 * - <b> → <strong>, <i> → <em>
 * - <div>/<p> boundaries and \n → <br>
 * - every other tag is stripped (content kept), attributes are dropped
 */
export function sanitizeRich(html: string): string {
  let out = html
    // normalise contentEditable block boundaries to line breaks
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br[^>]*\/?>/gi, "\n")
    // normalise bold/italic aliases (keep content)
    .replace(/<(\/?)b(\s[^>]*)?>/gi, "<$1strong>")
    .replace(/<(\/?)i(\s[^>]*)?>/gi, "<$1em>")
    // keep ONLY a validated data-c attribute on strong/em; drop everything else
    .replace(/<(strong|em)(\s[^>]*)?>/gi, (_all, t: string, attrs?: string) =>
      normalizeOpenTag(t.toLowerCase(), attrs))
    // strip every other tag, keep inner text
    .replace(/<(?!\/?(strong|em)[\s>])[^>]*>/gi, "");
  // balance stray/unclosed strong|em tags: drop unmatched closers, close
  // unclosed openers, and drop empty spans. Unbalanced values (e.g.
  // "<strong>test</strong><strong>") otherwise never round-trip through the
  // DOM identically, causing endless re-apply flicker.
  out = balanceTags(out);
  // decode the few entities contentEditable emits, then re-escape safely
  out = out
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
  // re-escape while protecting our allowed tags (colour spans encode the hex
  // into the placeholder so escapeHtml can't touch the quotes)
  const colorSlots: string[] = [];
  out = out
    .replace(/<(strong|em) data-c="(#[0-9A-F]{6})">/g, (_all, t: string, hex: string) => {
      colorSlots.push(`<${t} data-c="${hex}">`);
      return `\u0005${colorSlots.length - 1}\u0006`;
    })
    .replace(/<strong>/gi, "\u0001")
    .replace(/<\/strong>/gi, "\u0002")
    .replace(/<em>/gi, "\u0003")
    .replace(/<\/em>/gi, "\u0004");
  out = escapeHtml(out);
  out = out
    .replace(/\u0001/g, "<strong>")
    .replace(/\u0002/g, "</strong>")
    .replace(/\u0003/g, "<em>")
    .replace(/\u0004/g, "</em>")
    .replace(/\u0005(\d+)\u0006/g, (_all, i: string) => colorSlots[Number(i)] ?? "")
    .replace(/\n/g, "<br>");
  // drop a single trailing <br> (contentEditable artefact)
  out = out.replace(/(<br>)+$/, "");
  return out;
}

/**
 * Balance <strong>/<em> tags in a normalised markup string:
 * - unmatched closing tags are dropped
 * - unclosed opening tags are auto-closed at the end
 * - empty spans (<strong></strong>) are removed
 * Idempotent, so stored values round-trip through the DOM byte-identically.
 */
export function balanceTags(s: string): string {
  const stack: { tag: string; open: string }[] = [];
  let out = "";
  const re = /<(\/?)(strong|em)( data-c="#[0-9A-F]{6}")?>|[^<]+|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[2]) {
      const tag = m[2].toLowerCase();
      if (m[1]) {
        // closing tag: only emit if it matches an open tag
        let idx = -1;
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { idx = i; break; }
        if (idx !== -1) {
          // close any inner tags opened after it (rebalance), then this one
          for (let i = stack.length - 1; i > idx; i--) out += `</${stack[i].tag}>`;
          out += `</${tag}>`;
          const reopen = stack.splice(idx + 1);
          stack.pop();
          for (const t of reopen) { out += t.open; stack.push(t); }
        }
        // unmatched closer: drop
      } else {
        const open = `<${tag}${m[3] ?? ""}>`;
        stack.push({ tag, open });
        out += open;
      }
    } else {
      out += m[0];
    }
  }
  // auto-close anything left open
  for (let i = stack.length - 1; i >= 0; i--) out += `</${stack[i].tag}>`;
  // remove empty spans (possibly nested after removal)
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/<(strong|em)( data-c="#[0-9A-F]{6}")?><\/\1>/gi, "");
  }
  return out;
}

/** Plain text (with \n) → safe markup (<br> line breaks, everything escaped). */
export function plainToRich(plain: string): string {
  return escapeHtml(plain).replace(/\n/g, "<br>");
}

/** Safe markup → plain text with \n for textarea editing (tags dropped except br). */
export function richToPlain(rich: string): string {
  return rich
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(strong|em)(\s[^>]*)?>/gi, "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");
}

/**
 * Safe markup → textarea-editable markup: keeps <strong>/<em> literally so
 * Ctrl+B / Ctrl+I can wrap selections in the Inspector textarea, but turns
 * <br> into real newlines.
 */
export function richToEditable(rich: string): string {
  return rich
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");
}

/** Textarea-editable markup (literal <strong>/<em>, real newlines) → safe markup. */
export function editableToRich(editable: string): string {
  return sanitizeRich(editable.replace(/\n/g, "<br>"));
}

/**
 * Italics lint: italicise a word, never a whole sentence.
 * Flags any <em> span containing more than 3 words.
 */
export function lintItalics(rich: string): { span: string; reason: string }[] {
  const hits: { span: string; reason: string }[] = [];
  const re = /<em(?:\s[^>]*)?>([\s\S]*?)<\/em>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rich))) {
    const words = m[1].replace(/<[^>]*>/g, "").trim().split(/\s+/).filter(Boolean);
    if (words.length > 3) {
      hits.push({
        span: words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : ""),
        reason: "Italicise one word, never a whole sentence",
      });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Span-level colour helpers (Inspector "special word" picker)         */
/* ------------------------------------------------------------------ */

export interface RichSpan {
  /** 0-based index among formatted spans, in document order. */
  index: number;
  /** "strong" | "em" */
  tag: "strong" | "em";
  /** Plain-text content of the span (inner tags stripped). */
  text: string;
  /** Current data-c colour, if any. */
  color: string | null;
}

const SPAN_RE = /<(strong|em)( data-c="(#[0-9A-F]{6})")?>([\s\S]*?)<\/\1>/g;

/**
 * List the formatted (strong/em) spans in sanitized markup, in order.
 * Only top-level match granularity is needed for the picker: nested spans
 * are rare and the innermost colour wins at render time anyway.
 */
export function listSpans(rich: string): RichSpan[] {
  const spans: RichSpan[] = [];
  let m: RegExpExecArray | null;
  SPAN_RE.lastIndex = 0;
  while ((m = SPAN_RE.exec(rich))) {
    spans.push({
      index: spans.length,
      tag: m[1] as "strong" | "em",
      text: m[4].replace(/<[^>]*>/g, ""),
      color: m[3] ?? null,
    });
  }
  return spans;
}

/**
 * Set (or clear, with hex=null) the colour of the Nth formatted span.
 * Input and output are sanitized markup; invalid hex leaves markup unchanged.
 */
export function setSpanColor(rich: string, index: number, hex: string | null): string {
  const norm = hex === null ? null : normalizeHex(hex);
  if (hex !== null && norm === null) return rich;
  let i = -1;
  SPAN_RE.lastIndex = 0;
  return rich.replace(SPAN_RE, (all, tag: string, _attr, _hex, inner: string) => {
    i += 1;
    if (i !== index) return all;
    return norm ? `<${tag} data-c="${norm}">${inner}</${tag}>` : `<${tag}>${inner}</${tag}>`;
  });
}
