/**
 * DeviceFrame — a device frame (phone bezel or browser chrome, per
 * canvas.config.ts) that live-renders one surface from REAL screen code,
 * instrumented for direct-manipulation editing.
 *
 * Edit interactions (Canva-grade):
 * - click: select element (shows bounding box + info in inspector)
 * - double-click: inline text edit (contentEditable) with copy lint
 * - drag selected: move with dx/dy offsets (logged as `move`)
 * - corner handle: resize (logged as `resize`)
 * - Delete key: hide element (logged as `delete` with snapshot)
 * - arrow keys: 1px nudge (shift = 10px)
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import config from "../../../canvas.config";
import { getMount } from "./mounts";
import { instrumentSurface, readElementInfo, hasDirectText, rgbToHex } from "./instrument";
import { useCanvasStore, useCanvasState, type ElementOverride, type InsertedElement } from "./store";
import { isRichText, sanitizeRich, richToPlain } from "../../../shared/richtext";
import type { SurfaceDef } from "./registry";

export const FRAME_W = config.device.width;
export const FRAME_H = config.device.height;

/**
 * F9 — clamp a drag offset so the element's box stays inside the frame.
 * `rect` is the element's untranslated box relative to the frame (CSS px).
 * Exported for unit tests.
 */
export function clampToFrame(
  dx: number,
  dy: number,
  rect: { left: number; top: number; w: number; h: number },
  frameW: number = FRAME_W,
  frameH: number = FRAME_H,
): { dx: number; dy: number } {
  const minDx = -rect.left;
  const maxDx = frameW - rect.left - rect.w;
  const minDy = -rect.top;
  const maxDy = frameH - rect.top - rect.h;
  return {
    dx: Math.min(Math.max(dx, minDx), Math.max(minDx, maxDx)),
    dy: Math.min(Math.max(dy, minDy), Math.max(minDy, maxDy)),
  };
}

interface Props {
  surface: SurfaceDef;
  editable: boolean;
  onNavigate?: (toSurfaceId: string) => void;
}

function DeviceFrameImpl({ surface, editable, onNavigate }: Props) {
  const store = useCanvasStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const selection = useCanvasState((s) => s.selection);
  const overrides = useCanvasState((s) => s.overrides);
  const inserted = useCanvasState((s) => s.inserted);
  const showBefore = useCanvasState((s) => !!s.beforeAfter[surface.id]);
  const darkMode = useCanvasState((s) => s.darkMode);
  const dynamicType = useCanvasState((s) => s.dynamicType);
  const playMode = useCanvasState((s) => s.playMode);
  const [selRect, setSelRect] = useState<DOMRect | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean; rect?: { left: number; top: number; w: number; h: number } | null } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; baseW: number; baseH: number } | null>(null);

  const mount = getMount(surface.id);

  // Instrument DOM after render
  useEffect(() => {
    const t = setTimeout(() => {
      if (rootRef.current) instrumentSurface(rootRef.current, surface.id);
    }, 350);
    const t2 = setInterval(() => {
      if (rootRef.current) instrumentSurface(rootRef.current, surface.id);
    }, 2500);
    return () => { clearTimeout(t); clearInterval(t2); };
  }, [surface.id]);

  // Apply overrides as DOM patches (skipped in "before" mode)
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      const els = root.querySelectorAll<HTMLElement>("[data-fd-id]");
      els.forEach((el) => {
        // never touch an element mid-inline-edit — rewriting it wipes the
        // user's typing, kills the selection, and aborts the edit session
        if (el.isContentEditable) return;
        const k = `${surface.id}::${el.dataset.fdId}`;
        const o = overrides[k] ?? overrides[`*::${el.dataset.fdId}`];
        // reset first
        el.style.removeProperty("outline");
        if (!o || showBefore) {
          if (el.dataset.fdPatched) {
            el.style.transform = el.dataset.fdOrigTransform ?? "";
            el.style.color = "";
            el.style.backgroundColor = "";
            el.style.fontSize = "";
            el.style.fontWeight = "";
            el.style.fontFamily = "";
            el.style.letterSpacing = "";
            el.style.lineHeight = "";
            el.style.textTransform = "";
            el.style.textAlign = "";
            el.style.borderColor = "";
            el.style.width = "";
            el.style.height = "";
            el.style.display = "";
            if (el.dataset.fdOrigHtml !== undefined) {
              el.innerHTML = el.dataset.fdOrigHtml;
              delete el.dataset.fdOrigHtml;
            } else if (el.dataset.fdOrigText !== undefined && hasDirectText(el)) {
              setDirectText(el, el.dataset.fdOrigText);
            }
            delete el.dataset.fdPatched;
          }
          return;
        }
        el.dataset.fdPatched = "1";
        if (el.dataset.fdOrigTransform === undefined) el.dataset.fdOrigTransform = el.style.transform || "";
        if (o.text !== undefined) {
          if (el.dataset.fdOrigText === undefined) el.dataset.fdOrigText = directText(el);
          // ALWAYS snapshot the original markup before the first text patch:
          // originals may carry built-in <em>/<strong> (e.g. "Find your <em>wavelength</em>.")
          // that a plain-text override would otherwise destroy on undo
          if (el.dataset.fdOrigHtml === undefined && isLeafRichHost(el)) el.dataset.fdOrigHtml = el.innerHTML;
          // compare in normalised form: legacy/malformed stored values (e.g.
          // unbalanced "<strong>test</strong><strong>") never match the DOM's
          // auto-balanced serialisation, which caused a 600ms rewrite flicker
          const want = isRichText(o.text) ? sanitizeRich(o.text) : o.text;
          if (readEditableValue(el) !== want) applyEditableValue(el, want);
        }
        if (o.color) el.style.color = o.color;
        if (o.background) el.style.backgroundColor = o.background;
        if (o.fontSize) el.style.fontSize = o.fontSize;
        if (o.fontWeight) el.style.fontWeight = o.fontWeight;
        if (o.fontFamily) el.style.fontFamily = o.fontFamily;
        if (o.letterSpacing) el.style.letterSpacing = o.letterSpacing;
        if (o.lineHeight) el.style.lineHeight = o.lineHeight;
        if (o.textTransform) el.style.textTransform = o.textTransform;
        if (o.textAlign) el.style.textAlign = o.textAlign;
        if (o.borderColor) el.style.borderColor = o.borderColor;
        if (o.dx || o.dy) el.style.transform = `${el.dataset.fdOrigTransform ?? ""} translate(${o.dx ?? 0}px, ${o.dy ?? 0}px)`.trim();
        else el.style.transform = el.dataset.fdOrigTransform ?? "";
        if (o.w) el.style.width = `${o.w}px`;
        if (o.h) el.style.height = `${o.h}px`;
        el.style.display = o.hidden ? "none" : "";
      });
    };
    apply();
    const id = setInterval(apply, 600);
    return () => clearInterval(id);
  }, [overrides, showBefore, surface.id]);

  // Track selection rect
  useEffect(() => {
    if (!selection || selection.surfaceId !== surface.id || !rootRef.current) {
      setSelRect(null);
      return;
    }
    const el = findEl(selection.elementId);
    if (!el) { setSelRect(null); return; }
    const update = () => {
      const rootBox = rootRef.current!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const scale = rootBox.width / FRAME_W;
      setSelRect(new DOMRect((box.left - rootBox.left) / scale, (box.top - rootBox.top) / scale, box.width / scale, box.height / scale));
    };
    update();
    const id = setInterval(update, 300);
    return () => clearInterval(id);
  }, [selection, surface.id, overrides]);

  const findEl = useCallback((elementId: string): HTMLElement | null => {
    if (!rootRef.current) return null;
    const els = rootRef.current.querySelectorAll<HTMLElement>("[data-fd-id]");
    for (const el of Array.from(els)) if (el.dataset.fdId === elementId) return el;
    return null;
  }, []);

  // ── Pointer interactions ────────────────────────────────────────────────
  const onClickCapture = (e: React.MouseEvent) => {
    if (playMode) {
      // Play mode: let button/anchor clicks resolve nav edges
      const target = (e.target as HTMLElement).closest("a,button") as HTMLElement | null;
      if (target && onNavigate) {
        const label = (target.textContent ?? "").trim().toLowerCase();
        const edge = surface.nav.find((n) => label && n.trigger.toLowerCase().includes(label.slice(0, 12)));
        if (edge && !edge.to.startsWith("toast:")) {
          e.preventDefault(); e.stopPropagation();
          onNavigate(edge.to);
          return;
        }
      }
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const el = (e.target as HTMLElement).closest("[data-fd-id]") as HTMLElement | null;
    if (el && el.dataset.fdId) {
      if (editingText === el.dataset.fdId) return;
      setEditingText(null);
      store.select(surface.id, el.dataset.fdId);
    } else {
      store.select(surface.id);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editable || playMode) return;
    e.preventDefault(); e.stopPropagation();
    const el = (e.target as HTMLElement).closest("[data-fd-id]") as HTMLElement | null;
    if (!el || !el.dataset.fdId || !hasDirectText(el)) return;
    const id = el.dataset.fdId;
    setEditingText(id);
    store.select(surface.id, id);
    const before = readEditableValue(el);
    const beforeNorm = isRichText(before) ? sanitizeRich(before) : before;
    // rich mode: allow strong/em/br; we sanitize on commit
    el.contentEditable = "true";
    el.focus();
    // emit <b>/<i> tags instead of styled spans so sanitizeRich can
    // normalise them to <strong>/<em> (spans are stripped, losing the format)
    document.execCommand?.("styleWithCSS", false, "false");
    document.execCommand?.("selectAll");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // read the value BEFORE tearing down contentEditable — teardown can
      // trigger a React/instrument rewrite that restores the original text
      const after = readEditableValue(el);
      el.contentEditable = "false";
      el.removeEventListener("blur", finish);
      el.removeEventListener("keydown", onKey);
      setEditingText(null);
      // normalise the DOM to the sanitized committed value right away —
      // unwraps leftover execCommand spans (which the instrument interval
      // would otherwise tag with junk ids) and keeps DOM === stored value
      applyEditableValue(el, after);
      if (after !== beforeNorm) {
        const info = readElementInfo(el);
        store.applyOverride(surface.id, id, "edit", "text", beforeNorm, after, { text: after }, { elementRole: info.role, componentName: surface.name });
      }
    };
    const onKey = (ke: KeyboardEvent) => {
      ke.stopPropagation();
      if (ke.key === "Enter" && !ke.shiftKey) { ke.preventDefault(); el.blur(); }
      if (ke.key === "Enter" && ke.shiftKey) { ke.preventDefault(); document.execCommand?.("insertLineBreak"); }
      if ((ke.ctrlKey || ke.metaKey) && ke.key.toLowerCase() === "b") { ke.preventDefault(); document.execCommand?.("bold"); }
      if ((ke.ctrlKey || ke.metaKey) && ke.key.toLowerCase() === "i") { ke.preventDefault(); document.execCommand?.("italic"); }
      if (ke.key === "Escape") { applyEditableValue(el, before); el.blur(); }
    };
    el.addEventListener("blur", finish);
    el.addEventListener("keydown", onKey);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || playMode || editingText) return;
    const el = (e.target as HTMLElement).closest("[data-fd-id]") as HTMLElement | null;
    if (!el || !el.dataset.fdId) return;
    if (!selection || selection.elementId !== el.dataset.fdId) return; // only drag when already selected
    const k = `${surface.id}::${el.dataset.fdId}`;
    const o = overrides[k] ?? overrides[`*::${el.dataset.fdId}`];
    // F9: capture the element's untranslated rect (relative to frame) for bounds clamping
    const scale0 = rootRef.current ? rootRef.current.getBoundingClientRect().width / FRAME_W : 1;
    const root = rootRef.current?.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const baseDx0 = o?.dx ?? 0, baseDy0 = o?.dy ?? 0;
    const rect = root
      ? { left: (er.left - root.left) / scale0 - baseDx0, top: (er.top - root.top) / scale0 - baseDy0, w: er.width / scale0, h: er.height / scale0 }
      : null;
    dragRef.current = { id: el.dataset.fdId, startX: e.clientX, startY: e.clientY, baseDx: baseDx0, baseDy: baseDy0, moved: false, rect };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const scale = rootRef.current ? rootRef.current.getBoundingClientRect().width / FRAME_W : 1;
    if (resizeRef.current) {
      const r = resizeRef.current;
      const el = findEl(r.id);
      if (el) {
        const w = Math.max(20, r.baseW + (e.clientX - r.startX) / scale);
        const h = Math.max(12, r.baseH + (e.clientY - r.startY) / scale);
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
      }
      return;
    }
    if (!dragRef.current) return;
    const d = dragRef.current;
    const raw = { dx: d.baseDx + (e.clientX - d.startX) / scale, dy: d.baseDy + (e.clientY - d.startY) / scale };
    const { dx, dy } = d.rect ? clampToFrame(raw.dx, raw.dy, d.rect) : raw;
    if (Math.abs(dx - d.baseDx) > 2 || Math.abs(dy - d.baseDy) > 2) d.moved = true;
    const el = findEl(d.id);
    if (el) el.style.transform = `${el.dataset.fdOrigTransform ?? ""} translate(${Math.round(dx)}px, ${Math.round(dy)}px)`.trim();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const scale = rootRef.current ? rootRef.current.getBoundingClientRect().width / FRAME_W : 1;
    if (resizeRef.current) {
      const r = resizeRef.current;
      const w = Math.round(Math.max(20, r.baseW + (e.clientX - r.startX) / scale));
      const h = Math.round(Math.max(12, r.baseH + (e.clientY - r.startY) / scale));
      const el = findEl(r.id);
      const info = el ? readElementInfo(el) : null;
      store.applyOverride(surface.id, r.id, "resize", "size", { w: Math.round(r.baseW), h: Math.round(r.baseH) }, { w, h }, { w, h }, { elementRole: info?.role, componentName: surface.name });
      resizeRef.current = null;
      return;
    }
    if (!dragRef.current) return;
    const d = dragRef.current;
    dragRef.current = null;
    if (!d.moved) return;
    const raw = { dx: d.baseDx + (e.clientX - d.startX) / scale, dy: d.baseDy + (e.clientY - d.startY) / scale };
    const clamped = d.rect ? clampToFrame(raw.dx, raw.dy, d.rect) : raw;
    const dx = Math.round(clamped.dx);
    const dy = Math.round(clamped.dy);
    const el = findEl(d.id);
    const info = el ? readElementInfo(el) : null;
    store.applyOverride(surface.id, d.id, "move", "position", { dx: d.baseDx, dy: d.baseDy }, { dx, dy }, { dx, dy }, { elementRole: info?.role, componentName: surface.name });
  };

  const startResize = (e: React.PointerEvent) => {
    if (!selection || !selRect) return;
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { id: selection.elementId, startX: e.clientX, startY: e.clientY, baseW: selRect.width, baseH: selRect.height };
  };

  const insertedForSurface = Object.values(inserted).filter((i) => i.surfaceId === surface.id);

  const isPhone = config.device.kind === "phone";
  const ACCENT = config.accent;
  return (
    <div
      style={{
        width: FRAME_W + 24,
        height: FRAME_H + 24,
        borderRadius: isPhone ? 64 : 16,
        background: "#1a1a1c",
        padding: 12,
        boxShadow: "0 24px 80px rgba(0,0,0,0.28), 0 4px 20px rgba(0,0,0,0.18), 0 0 0 2.5px #3a3a3d inset",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Phone: Dynamic Island · Browser: traffic-light dots */}
      {isPhone ? (
        <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", width: 126, height: 37, borderRadius: 20, background: "#000", zIndex: 30, pointerEvents: "none" }} />
      ) : (
        <div style={{ position: "absolute", top: 14, left: 24, display: "flex", gap: 6, zIndex: 30, pointerEvents: "none" }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c, display: "inline-block" }} />
          ))}
        </div>
      )}
      <div
        ref={rootRef}
        data-fd-frame={surface.id}
        onClickCapture={onClickCapture}
        onDoubleClickCapture={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          width: FRAME_W,
          height: FRAME_H,
          borderRadius: isPhone ? 52 : 8,
          overflow: "hidden",
          background: "#F4F4F4",
          position: "relative",
          filter: darkMode ? "invert(0.92) hue-rotate(180deg)" : undefined,
          fontSize: dynamicType ? "1.25em" : undefined,
          cursor: editable && !playMode ? "default" : playMode ? "pointer" : "default",
        }}
        className={dynamicType ? "fd-dynamic-type" : undefined}
        data-fd-dark={darkMode ? "true" : undefined}
      >
        {/* Real screen render */}
        <div style={{ width: "100%", height: "100%", overflow: "auto" }} className={`fd-screen-scroll${editable && !playMode ? " fd-editable" : ""}`}>
          {mount ? mount.render() : (
            <div style={{ padding: 40, fontFamily: "monospace", fontSize: 12, color: ACCENT }}>
              No mount registered for surface "{surface.id}"
            </div>
          )}
        </div>

        {/* Inserted elements */}
        {!showBefore && insertedForSurface.map((ins) => (
          <InsertedEl key={ins.elementId} spec={ins} surfaceId={surface.id} />
        ))}

        {/* Selection box */}
        {selRect && selection?.surfaceId === surface.id && !showBefore && (
          <div
            style={{
              position: "absolute",
              left: selRect.x - 2,
              top: selRect.y - 2,
              width: selRect.width + 4,
              height: selRect.height + 4,
              border: `1.5px solid ${ACCENT}`,
              borderRadius: 4,
              pointerEvents: "none",
              zIndex: 40,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
            }}
          >
            {/* corner resize handle */}
            <div
              onPointerDown={startResize}
              style={{
                position: "absolute", right: -6, bottom: -6, width: 12, height: 12,
                borderRadius: 3, background: ACCENT, border: "2px solid #fff",
                cursor: "nwse-resize", pointerEvents: "auto",
              }}
            />
          </div>
        )}

        {/* Before badge */}
        {showBefore && (
          <div style={{ position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 45, background: "#111111", color: "#fff", borderRadius: 100, padding: "4px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: config.uiFont }}>
            Before
          </div>
        )}
      </div>
    </div>
  );
}

function InsertedEl({ spec, surfaceId }: { spec: InsertedElement; surfaceId: string }) {
  const store = useCanvasStore();
  const selection = useCanvasState((s) => s.selection);
  const isSel = selection?.surfaceId === surfaceId && selection.elementId === spec.elementId;
  const ACCENT = config.accent;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); store.select(surfaceId, spec.elementId); }}
      style={{
        position: "absolute",
        left: spec.dx,
        top: spec.dy,
        zIndex: 35,
        padding: spec.kind === "button" ? "12px 24px" : "4px 8px",
        borderRadius: spec.kind === "button" ? 100 : 6,
        background: spec.background,
        color: spec.color,
        fontSize: spec.fontSize,
        fontFamily: spec.kind === "note" ? config.uiFont : config.fonts[0]?.css ?? "serif",
        border: isSel ? `1.5px solid ${ACCENT}` : spec.kind === "note" ? `1px dashed ${ACCENT}80` : "none",
        cursor: "move",
        maxWidth: 300,
        boxShadow: spec.kind === "button" ? "0 4px 20px rgba(0,0,0,0.2)" : undefined,
      }}
    >
      {spec.text}
    </div>
  );
}

function directText(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join("");
}

function setDirectText(el: HTMLElement, text: string) {
  const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
  if (textNodes.length === 0) {
    el.insertBefore(document.createTextNode(text), el.firstChild);
    return;
  }
  textNodes[0].textContent = text;
  textNodes.slice(1).forEach((n) => { n.textContent = ""; });
}

/**
 * Rich-aware value readers/writers.
 * "Leaf" elements (no element children other than formatting tags) are edited
 * via sanitized innerHTML so <strong>/<em>/<br> survive. Mixed containers fall
 * back to direct-text-node editing to avoid clobbering child components.
 */
function isLeafRichHost(el: HTMLElement): boolean {
  return Array.from(el.children).every((c) => ["STRONG", "EM", "B", "I", "BR"].includes(c.tagName));
}

function readEditableValue(el: HTMLElement): string {
  if (isLeafRichHost(el)) {
    const sanitized = sanitizeRich(el.innerHTML);
    // keep plain values plain so unformatted edits diff cleanly
    return isRichText(sanitized) ? sanitized : richToPlain(sanitized);
  }
  return directText(el);
}

function applyEditableValue(el: HTMLElement, value: string) {
  if (isRichText(value)) {
    if (isLeafRichHost(el)) { el.innerHTML = sanitizeRich(value); paintColorSpans(el); return; }
    // mixed container: apply the readable plain form to its text nodes
    setDirectText(el, richToPlain(value));
    return;
  }
  if (isLeafRichHost(el) && (el.children.length > 0 || value.includes("\n"))) {
    // element previously had formatting or the new value has line breaks
    el.innerHTML = sanitizeRich(value.replace(/\n/g, "<br>"));
    paintColorSpans(el);
    return;
  }
  setDirectText(el, value);
}

/**
 * Span-level colour: map data-c="#RRGGBB" (the only attribute sanitizeRich
 * keeps on strong/em) onto an inline colour so a single special word can be
 * recoloured independently of the rest of the line. innerHTML serialisation
 * keeps the style attribute out of readEditableValue's sanitized round-trip
 * (sanitizeRich strips style), so the 600ms re-apply loop stays byte-stable.
 */
function paintColorSpans(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>("strong[data-c], em[data-c]").forEach((s) => {
    const hex = s.dataset.c ?? "";
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) s.style.color = hex;
  });
}

export const DeviceFrame = memo(DeviceFrameImpl);
