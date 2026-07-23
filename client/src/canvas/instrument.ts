/**
 * DOM instrumentation — walks a rendered surface's DOM and assigns each
 * editable element a stable elementId anchored to real source code.
 *
 * The vite jsx-loc plugin stamps `data-loc="<relativePath>:<line>"` on every
 * JSX element at build time; we convert that into `data-fd-id`
 * "<file>@<line>#<ordinal>" so duplicate JSX call-sites (list items) stay
 * unique. Elements without data-loc (fragments from libs) get a path hash.
 */
export interface ElementInfo {
  elementId: string;
  role: string;
  componentName: string;
  sourceFile: string;
  line: number;
  text: string | null;
  color: string;
  background: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  letterSpacing: string;
  lineHeight: string;
  textTransform: string;
  textAlign: string;
  borderColor: string;
}

const EDITABLE_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "SPAN", "A", "BUTTON", "LABEL", "EM", "STRONG", "DIV", "IMG", "LI", "INPUT", "TEXTAREA"]);

export function instrumentSurface(root: HTMLElement, surfaceId: string): void {
  const counts = new Map<string, number>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as HTMLElement | null;
  while (node) {
    // Never instrument ephemeral nodes created during an inline edit
    // (execCommand spans/b/i inside a contentEditable host) — they'd get
    // junk "<surface>/dom@…" ids that leak into overrides and the change log.
    const insideEdit = node.closest('[contenteditable="true"]') !== null;
    // Formatting tags that live inside an already-instrumented parent are the
    // parent's rich content, not independent editable elements.
    const isRichChild = ["EM", "STRONG", "B", "I"].includes(node.tagName)
      && !!node.parentElement?.closest("[data-fd-id]");
    if (!insideEdit && !isRichChild && EDITABLE_TAGS.has(node.tagName) && !node.dataset.fdId) {
      const loc = node.dataset.loc; // "<abs path>:<line>:<col>" from jsx-loc
      let base: string;
      if (loc) {
        const idx = loc.lastIndexOf(":");
        const line = idx >= 0 ? loc.slice(idx + 1) : "0";
        const file = (idx >= 0 ? loc.slice(0, idx) : loc).replace(/^.*?client\/src\//, "client/src/");
        base = `${file}@${line}`;
      } else {
        base = `${surfaceId}/dom@0/${cssPath(node, root)}`;
      }
      const n = (counts.get(base) ?? 0) + 1;
      counts.set(base, n);
      node.dataset.fdId = n === 1 ? base : `${base}#${n}`;
      node.dataset.fdSurface = surfaceId;
    }
    node = walker.nextNode() as HTMLElement | null;
  }
}

function cssPath(el: HTMLElement, root: HTMLElement): string {
  const segs: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root && segs.length < 8) {
    const parent: HTMLElement | null = cur.parentElement;
    const idx = parent ? Array.prototype.indexOf.call(parent.children, cur) : 0;
    segs.unshift(`${cur.tagName.toLowerCase()}[${idx}]`);
    cur = parent;
  }
  return segs.join(">");
}

/** Whether the element's text is directly editable (owns its text nodes). */
export function hasDirectText(el: HTMLElement): boolean {
  return Array.from(el.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
  );
}

export function readElementInfo(el: HTMLElement): ElementInfo {
  const cs = window.getComputedStyle(el);
  const id = el.dataset.fdId ?? "unknown";
  const m = /^(.*)@(\d+)/.exec(id);
  return {
    elementId: id,
    role: roleOf(el),
    componentName: el.dataset.fdSurface ?? "",
    sourceFile: m ? m[1] : "unknown",
    line: m ? parseInt(m[2], 10) : 0,
    text: hasDirectText(el) ? (el.textContent ?? "") : null,
    color: cs.color,
    background: cs.backgroundColor,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    fontFamily: cs.fontFamily,
    letterSpacing: cs.letterSpacing,
    lineHeight: cs.lineHeight,
    textTransform: cs.textTransform,
    textAlign: cs.textAlign,
    borderColor: cs.borderTopColor,
  };
}

function roleOf(el: HTMLElement): string {
  const t = el.tagName;
  if (t === "BUTTON" || (t === "A" && el.getAttribute("href"))) return "button/link";
  if (/^H[1-6]$/.test(t)) return "heading";
  if (t === "IMG") return "image";
  if (t === "INPUT" || t === "TEXTAREA") return "input";
  if (t === "P" || t === "SPAN" || t === "EM" || t === "STRONG" || t === "LABEL") return "text";
  return "container";
}

/** rgb(...) -> #hex for palette comparison */
export function rgbToHex(rgb: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return rgb;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => parseInt(v, 10));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
