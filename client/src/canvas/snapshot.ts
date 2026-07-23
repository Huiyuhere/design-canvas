/**
 * DOM → SurfaceSnapshot capture. Walks a rendered device frame and records
 * computed styles + layout boxes for every visible element, in frame
 * coordinates. Runs in the browser (canvas UI and the /snapshot API both use
 * it via the iOS preview page); pure DOM, no React dependency.
 */
import config from "../../../canvas.config";
import { normalizeColor, type SnapshotNode, type SurfaceSnapshot, type TextStyle } from "../../../shared/uiSnapshot";

const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "a", "strong", "em", "li", "blockquote", "figcaption", "time"]);

function kindOf(el: Element): SnapshotNode["kind"] {
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "input" || tag === "textarea" || tag === "select") return "input";
  if (tag === "img" || tag === "svg" || tag === "picture" || tag === "video") return "image";
  if (TEXT_TAGS.has(tag)) return "text";
  return "container";
}

/** Own text content: direct text nodes only, so nested elements aren't doubled. */
function ownText(el: Element): string | null {
  let out = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
  });
  const t = out.replace(/\s+/g, " ").trim();
  if (t) return t;
  // Elements whose only children are formatting spans (<strong>/<em>) still
  // read as a single text run.
  const onlyFormatting = Array.from(el.children).every((c) =>
    ["strong", "em", "b", "i", "br", "span"].includes(c.tagName.toLowerCase()),
  );
  if (onlyFormatting && el.children.length > 0) {
    const whole = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return whole || null;
  }
  return null;
}

function textStyleOf(cs: CSSStyleDeclaration): TextStyle {
  const family = cs.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  const deco = cs.textDecorationLine.includes("underline")
    ? "underline"
    : cs.textDecorationLine.includes("line-through")
      ? "line-through"
      : "none";
  const ls = cs.letterSpacing === "normal" ? null : parseFloat(cs.letterSpacing);
  const lh = cs.lineHeight === "normal" ? null : parseFloat(cs.lineHeight);
  const align = (["left", "center", "right", "justify"] as const).find((a) => cs.textAlign.includes(a)) ?? "left";
  const tt = (["uppercase", "lowercase", "capitalize"] as const).find((t) => cs.textTransform === t) ?? "none";
  return {
    fontFamily: family,
    fontSizePx: parseFloat(cs.fontSize),
    fontWeight: Number(cs.fontWeight) || 400,
    fontStyle: cs.fontStyle === "italic" ? "italic" : "normal",
    color: normalizeColor(cs.color) ?? "#000000",
    letterSpacingPx: Number.isFinite(ls as number) ? (ls as number) : null,
    lineHeightPx: Number.isFinite(lh as number) ? (lh as number) : null,
    textAlign: align,
    textDecoration: deco,
    textTransform: tt,
  };
}

function captureNode(el: Element, frameRect: DOMRect, scale: number): SnapshotNode | null {
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 0.5 || r.height < 0.5) return null;

  const kind = kindOf(el);
  const tag = el.tagName.toLowerCase();
  const imgSrc =
    tag === "img"
      ? (el as HTMLImageElement).src
      : cs.backgroundImage && cs.backgroundImage !== "none"
        ? (cs.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? null)
        : null;
  const imageMode = imgSrc
    ? tag === "img"
      ? cs.objectFit === "contain"
        ? "contain"
        : cs.objectFit === "fill"
          ? "fill"
          : "cover"
      : cs.backgroundSize === "contain"
        ? "contain"
        : "cover"
    : null;

  const borderW = parseFloat(cs.borderTopWidth) || 0;
  const text = kind === "container" || kind === "image" ? null : ownText(el);

  const children: SnapshotNode[] = [];
  Array.from(el.children).forEach((c) => {
    const n = captureNode(c, frameRect, scale);
    if (n) children.push(n);
  });

  return {
    elementId: el.getAttribute("data-fd-id"),
    kind,
    tag,
    text,
    box: {
      x: Math.round(((r.left - frameRect.left) / scale) * 100) / 100,
      y: Math.round(((r.top - frameRect.top) / scale) * 100) / 100,
      w: Math.round((r.width / scale) * 100) / 100,
      h: Math.round((r.height / scale) * 100) / 100,
    },
    background: normalizeColor(cs.backgroundColor),
    imageSrc: imgSrc,
    imageMode,
    borderRadiusPx: parseFloat(cs.borderTopLeftRadius) || 0,
    border: borderW > 0 ? { widthPx: borderW, color: normalizeColor(cs.borderTopColor) ?? "#000000" } : null,
    opacity: parseFloat(cs.opacity),
    zIndex: Number(cs.zIndex) || 0,
    textStyle: text !== null || kind === "input" ? textStyleOf(cs) : null,
    children,
  };
}

/**
 * Capture a snapshot of a rendered surface. `rootEl` is the frame's screen
 * area (the element sized device.width × device.height).
 */
export function captureSnapshot(rootEl: HTMLElement, surfaceId: string, surfaceName: string): SurfaceSnapshot {
  const rect = rootEl.getBoundingClientRect();
  const scale = rect.width / config.device.width || 1;
  const root = captureNode(rootEl, rect, scale);
  if (!root) throw new Error(`Surface root for ${surfaceId} is not visible`);
  return {
    surfaceId,
    surfaceName,
    capturedAt: new Date().toISOString(),
    device: { width: config.device.width, height: config.device.height },
    root,
  };
}

