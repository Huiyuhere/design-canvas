/**
 * Inspector — right panel showing the selected element's live properties with
 * Canva-grade controls: text, brand color picker (off-palette flagged), font
 * size/weight, nudge, hide/delete, annotation.
 */
import { useEffect, useMemo, useState } from "react";
import { useCanvasStore, useCanvasState } from "./store";
import { readElementInfo, rgbToHex, hasDirectText, type ElementInfo } from "./instrument";
import { BRAND_TOKENS, EXTENDED_PALETTE, BRAND_FONTS, isOffPalette, lintCopy } from "../../../shared/tokens";
import { isRichText, richToEditable, editableToRich, richToPlain, lintItalics, listSpans, setSpanColor } from "../../../shared/richtext";
import { getSurface } from "./registry";

function findElement(surfaceId: string, elementId: string): HTMLElement | null {
  const frame = document.querySelector(`[data-fd-frame="${surfaceId}"]`);
  if (!frame) return null;
  const els = frame.querySelectorAll<HTMLElement>("[data-fd-id]");
  for (const el of Array.from(els)) if (el.dataset.fdId === elementId) return el;
  return null;
}

const S = {
  label: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(17,17,17,0.4)", fontFamily: "'Nunito', sans-serif", marginBottom: 6 } as React.CSSProperties,
  row: { marginBottom: 16 } as React.CSSProperties,
  input: { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", fontSize: 13, fontFamily: "'Nunito', sans-serif", background: "#fff", color: "#111", outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  btn: { padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#fff", fontSize: 12, fontFamily: "'Nunito', sans-serif", fontWeight: 700, cursor: "pointer", color: "#111" } as React.CSSProperties,
};

/** Swatch strip: 6 brand tokens (top row) + extended Ink derivatives (bottom row). */
function Swatches({ cur, onPick }: { cur: string; onPick: (hex: string) => void }) {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const strip = (tokens: readonly { name: string; hex: string; usage: string }[]) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {tokens.map((t) => (
        <button
          key={t.name}
          title={`${t.name} ${t.hex} — ${t.usage}`}
          onClick={() => onPick(t.hex)}
          style={{
            width: 24, height: 24, borderRadius: 7, cursor: "pointer",
            background: t.hex.startsWith("rgba") ? `linear-gradient(${t.hex}, ${t.hex}), #FFFFFF` : t.hex,
            border: norm(cur) === norm(t.hex) ? "2px solid #14655A" : "1px solid rgba(17,17,17,0.15)",
            padding: 0, boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {strip(BRAND_TOKENS)}
      {strip(EXTENDED_PALETTE)}
    </div>
  );
}

export function Inspector() {
  const store = useCanvasStore();
  const selection = useCanvasState((s) => s.selection);
  const overrides = useCanvasState((s) => s.overrides);
  const inserted = useCanvasState((s) => s.inserted);
  const [info, setInfo] = useState<ElementInfo | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [customColor, setCustomColor] = useState("#111111");
  const [spanIdx, setSpanIdx] = useState<number | null>(null); // null = whole element ("All text")
  const [applyShared, setApplyShared] = useState(true); // shared anchors: propagate edits to every screen by default

  const insertedSpec = selection ? inserted[`${selection.surfaceId}::${selection.elementId}`] : undefined;

  useEffect(() => {
    if (!selection) { setInfo(null); return; }
    if (insertedSpec) {
      setInfo({
        elementId: insertedSpec.elementId, role: insertedSpec.kind, componentName: "inserted",
        sourceFile: "(new element)", line: 0, text: insertedSpec.text,
        color: insertedSpec.color, background: insertedSpec.background, fontSize: insertedSpec.fontSize, fontWeight: "400",
        fontFamily: "'Nunito', sans-serif", letterSpacing: "normal", lineHeight: "normal", textTransform: "none", textAlign: "left", borderColor: "rgba(0,0,0,0)",
      });
      setTextDraft(insertedSpec.text);
      return;
    }
    const el = findElement(selection.surfaceId, selection.elementId);
    if (!el) { setInfo(null); return; }
    const i = readElementInfo(el);
    // if an override stores rich markup, surface it in editable form
    const key = `${selection.surfaceId}::${selection.elementId}`;
    const ov = overrides[key] ?? overrides[`*::${selection.elementId}`];
    const effective = ov?.text !== undefined ? ov.text : (i.text ?? "");
    setInfo({ ...i, text: effective });
    setTextDraft(isRichText(effective) ? richToEditable(effective) : effective);
    setSpanIdx(null);
  }, [selection, insertedSpec]);

  if (!selection || !info) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: "rgba(17,17,17,0.45)", fontFamily: "'Nunito', sans-serif", lineHeight: 1.6 }}>
        <p style={{ fontWeight: 700, marginBottom: 8, color: "#111" }}>Nothing selected</p>
        Click any element inside a frame to inspect and edit it. Double-click text to edit inline. Drag a selected element to move it.
      </div>
    );
  }

  const surface = getSurface(selection.surfaceId);
  const k = `${selection.surfaceId}::${selection.elementId}`;
  const o = overrides[k] ?? overrides[`*::${selection.elementId}`];
  const lint = lintCopy(textDraft);
  const italicsLint = lintItalics(editableToRich(textDraft));
  const curColorHex = o?.color ?? rgbToHex(info.color);
  const curBgHex = o?.background ?? rgbToHex(info.background);
  // Special spans: formatted words (em/strong) that can carry their own colour
  const richDraft = editableToRich(textDraft);
  const spans = insertedSpec ? [] : listSpans(richDraft);
  // no hook here (below an early return): a stale index simply resolves to
  // undefined, which renders whole-element mode until the next chip click
  const activeSpan = spanIdx !== null ? spans[spanIdx] : undefined;

  // Shared-element detection: anchor lives in a shared component file, so the
  // same data-fd-id appears in every mounted frame that renders it.
  const isSharedAnchor = /^client\/src\/components\//.test(selection.elementId);
  const sharedSurfaces = isSharedAnchor
    ? Array.from(new Set(Array.from(
        document.querySelectorAll(`[data-fd-id="${CSS.escape(selection.elementId)}"]`),
      ).map((n) => (n as HTMLElement).dataset.fdSurface).filter(Boolean))) as string[]
    : [];
  const sharedMeta = isSharedAnchor && applyShared
    ? { shared: true, sharedSurfaces }
    : {};

  const commitText = () => {
    if (insertedSpec) return; // inserted text edited via its own flow below
    const before = info.text ?? ""; // effective text (override-aware, set on selection)
    // convert textarea draft (real newlines + literal <strong>/<em>) to safe markup
    // NOTE: tags may carry attributes (<em data-c="#14655A">) — match those too,
    // otherwise the raw markup is committed as literal escaped text (regression guard).
    const hasFormatting = /<(strong|em|b|i)(\s[^>]*)?>/i.test(textDraft) || textDraft.includes("\n");
    const after = hasFormatting ? editableToRich(textDraft) : textDraft;
    if (after === before) return;
    store.applyOverride(selection.surfaceId, selection.elementId, "edit", "text", before, after, { text: after }, { elementRole: info.role, componentName: surface?.name, ...sharedMeta });
  };

  const setColor = (prop: "color" | "background", hex: string) => {
    if (prop === "color" && spanIdx !== null && spans[spanIdx]) { setSpanHex(hex); return; }
    const before = prop === "color" ? curColorHex : curBgHex;
    store.applyOverride(selection.surfaceId, selection.elementId, "edit", prop, before, hex, prop === "color" ? { color: hex } : { background: hex }, { elementRole: info.role, componentName: surface?.name, ...sharedMeta });
  };

  /** Recolour ONE formatted span: commits as a text override (markup diff). */
  const setSpanHex = (hex: string | null) => {
    if (spanIdx === null) return;
    const sp = spans[spanIdx];
    if (!sp) return;
    const before = info.text ?? "";
    const beforeRich = isRichText(before) ? before : richDraft;
    const after = setSpanColor(richDraft, spanIdx, hex);
    if (after === beforeRich) return;
    store.applyOverride(selection.surfaceId, selection.elementId, "edit", "text", beforeRich, after, { text: after }, {
      elementRole: info.role, componentName: surface?.name, ...sharedMeta,
      notes: hex ? `span colour: <${sp.tag}>"${sp.text}"</${sp.tag}> → ${hex}` : `span colour cleared on <${sp.tag}>"${sp.text}"</${sp.tag}>`,
    });
    setTextDraft(richToEditable(after));
  };

  const nudge = (dx: number, dy: number) => {
    const bdx = o?.dx ?? 0, bdy = o?.dy ?? 0;
    store.applyOverride(selection.surfaceId, selection.elementId, "move", "position", { dx: bdx, dy: bdy }, { dx: bdx + dx, dy: bdy + dy }, { dx: bdx + dx, dy: bdy + dy }, { elementRole: info.role, componentName: surface?.name, ...sharedMeta });
  };

  const setFont = (prop: "fontSize" | "fontWeight", val: string) => {
    const before = prop === "fontSize" ? (o?.fontSize ?? info.fontSize) : (o?.fontWeight ?? info.fontWeight);
    store.applyOverride(selection.surfaceId, selection.elementId, "edit", prop, before, val, { [prop]: val }, { elementRole: info.role, componentName: surface?.name, ...sharedMeta });
  };

  const setStyleProp = (prop: "fontFamily" | "letterSpacing" | "lineHeight" | "textTransform" | "textAlign" | "borderColor", val: string) => {
    const infoVal = info[prop];
    const before = o?.[prop] ?? infoVal;
    if (val === before) return;
    store.applyOverride(selection.surfaceId, selection.elementId, "edit", prop, before, val, { [prop]: val }, { elementRole: info.role, componentName: surface?.name, ...sharedMeta });
  };

  // Style-guide guardrail: serif is the Loud font — flag serif on small UI text
  const curFontFamily = o?.fontFamily ?? info.fontFamily;
  const firstFamily = curFontFamily.split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
  const isSerif = /times|georgia/.test(firstFamily) || firstFamily === "serif";
  const curSizePx = parseFloat(o?.fontSize ?? info.fontSize) || 0;
  const serifOnSmallUI = isSerif && curSizePx > 0 && curSizePx < 13;
  const tinyText = curSizePx > 0 && curSizePx < 10;
  const isButton = info.role === "button/link";
  const curBorderHex = o?.borderColor ?? rgbToHex(info.borderColor);

  return (
    <div style={{ padding: 18, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {/* Source anchor */}
      <div style={{ ...S.row, background: "#111111", borderRadius: 10, padding: "10px 12px" }}>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'Nunito', sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>{info.role} · {surface?.name}</p>
        <p style={{ fontSize: 11, color: "#F4B8C4", fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
          {info.sourceFile}{info.line ? `:${info.line}` : ""}
        </p>
        {surface?.codeRefs && Object.entries(surface.codeRefs).map(([platform, file]) => (
          file ? (
            <p key={platform} style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: "ui-monospace, monospace", marginTop: 3, wordBreak: "break-all" }}>{platform}: {file}</p>
          ) : null
        ))}
        {isSharedAnchor && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <p style={{ fontSize: 10, color: "#F4B8C4", fontFamily: "'Nunito', sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Shared · {sharedSurfaces.length || "?"} screens
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={applyShared} onChange={(e) => setApplyShared(e.target.checked)} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontFamily: "'Nunito', sans-serif" }}>
                Apply edits to all {sharedSurfaces.length || ""} screens
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Text */}
      {(info.text !== null || insertedSpec) && (
        <div style={S.row}>
          <p style={S.label}>Text <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· Enter = line break · Ctrl+B/I</span></p>
          <textarea
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              const mod = e.ctrlKey || e.metaKey;
              if (!mod) return;
              const key = e.key.toLowerCase();
              if (key !== "b" && key !== "i") return;
              e.preventDefault();
              const ta = e.target as HTMLTextAreaElement;
              const { selectionStart: s0, selectionEnd: s1 } = ta;
              if (s0 === s1) return; // need a selection to wrap
              const tag = key === "b" ? "strong" : "em";
              const sel = textDraft.slice(s0, s1);
              const open = `<${tag}>`, close = `</${tag}>`;
              const wrapped = sel.startsWith(open) && sel.endsWith(close)
                ? sel.slice(open.length, sel.length - close.length) // toggle off
                : `${open}${sel}${close}`;
              const next = textDraft.slice(0, s0) + wrapped + textDraft.slice(s1);
              setTextDraft(next);
              requestAnimationFrame(() => { ta.setSelectionRange(s0, s0 + wrapped.length); });
            }}
            rows={4}
            style={{ ...S.input, resize: "vertical" }}
          />
          {(lint.length > 0 || italicsLint.length > 0) && (
            <div style={{ marginTop: 6, background: "rgba(20,101,90,0.08)", border: "1px solid rgba(20,101,90,0.25)", borderRadius: 8, padding: "8px 10px" }}>
              {lint.map((l) => (
                <p key={l.term} style={{ fontSize: 11, color: "#14655A", fontFamily: "'Nunito', sans-serif", lineHeight: 1.5 }}>
                  <strong>{l.term === "!" ? "exclamation mark" : `"${l.term}"`}</strong> — {l.reason}
                </p>
              ))}
              {italicsLint.map((l, i) => (
                <p key={`it-${i}`} style={{ fontSize: 11, color: "#14655A", fontFamily: "'Nunito', sans-serif", lineHeight: 1.5 }}>
                  <strong>"{l.span}"</strong> — {l.reason}
                </p>
              ))}
            </div>
          )}
          {/* Special spans: pick an italic/bold word to recolour it alone */}
          {spans.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={S.label}>Special words <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· pick one to colour it alone</span></p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => setSpanIdx(null)}
                  style={{
                    ...S.btn, padding: "5px 10px", fontSize: 11.5,
                    background: spanIdx === null ? "#111111" : "#fff",
                    color: spanIdx === null ? "#fff" : "#111",
                    border: spanIdx === null ? "1px solid #111111" : "1px solid rgba(17,17,17,0.14)",
                  }}
                >
                  All text
                </button>
                {spans.map((sp) => (
                  <button
                    key={sp.index}
                    onClick={() => setSpanIdx(sp.index)}
                    title={`<${sp.tag}> span${sp.color ? ` · ${sp.color}` : ""}`}
                    style={{
                      ...S.btn, padding: "5px 10px", fontSize: 11.5,
                      fontStyle: sp.tag === "em" ? "italic" : "normal",
                      fontWeight: sp.tag === "strong" ? 800 : 700,
                      background: spanIdx === sp.index ? "#111111" : "#fff",
                      color: spanIdx === sp.index ? "#fff" : (sp.color ?? "#111"),
                      border: spanIdx === sp.index ? "1px solid #111111" : `1px solid ${sp.color ?? "rgba(17,17,17,0.14)"}`,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {sp.text.length > 18 ? sp.text.slice(0, 18) + "…" : sp.text}
                    {sp.color && <span style={{ width: 10, height: 10, borderRadius: 3, background: sp.color, border: "1px solid rgba(17,17,17,0.2)", display: "inline-block" }} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Color pickers */}
      {(["color", "background"] as const).map((prop) => {
        const spanMode = prop === "color" && activeSpan !== undefined;
        const cur = spanMode ? (activeSpan.color ?? curColorHex) : prop === "color" ? curColorHex : curBgHex;
        const off = isOffPalette(cur) && cur !== "rgba(0,0,0,0)" && !/^#?$/.test(cur) &&
          !EXTENDED_PALETTE.some((t) => t.hex.replace(/\s+/g, "").toLowerCase() === cur.replace(/\s+/g, "").toLowerCase());
        return (
          <div style={S.row} key={prop}>
            <p style={S.label}>
              {prop === "color" ? (spanMode ? <>Text colour · <span style={{ color: "#14655A", textTransform: "none" }}>"{activeSpan.text.length > 14 ? activeSpan.text.slice(0, 14) + "…" : activeSpan.text}" only</span></> : "Text colour") : "Background"}
              {off && <span style={{ color: "#14655A" }}> · off-palette</span>}
            </p>
            <Swatches cur={cur} onPick={(hex) => setColor(prop, hex)} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(cur) ? cur : customColor}
                onChange={(e) => { setCustomColor(e.target.value); }}
                onBlur={(e) => { if (e.target.value.toLowerCase() !== cur.toLowerCase()) setColor(prop, e.target.value.toUpperCase()); }}
                title="Custom colour (will be flagged off-palette)"
                style={{ width: 26, height: 26, border: "none", background: "none", cursor: "pointer", padding: 0 }}
              />
              <p style={{ fontSize: 11, color: "rgba(17,17,17,0.45)", fontFamily: "ui-monospace, monospace" }}>{cur}</p>
              {spanMode && activeSpan.color && (
                <button onClick={() => setSpanHex(null)} style={{ ...S.btn, padding: "4px 8px", fontSize: 10.5 }}>Clear</button>
              )}
            </div>
          </div>
        );
      })}

      {/* Button controls — role-aware */}
      {isButton && (
        <div style={{ ...S.row, background: "rgba(17,17,17,0.03)", borderRadius: 10, padding: "10px 12px" }}>
          <p style={S.label}>Button · border</p>
          <Swatches cur={curBorderHex} onPick={(hex) => setStyleProp("borderColor", hex)} />
          <p style={{ fontSize: 10.5, color: "rgba(17,17,17,0.45)", fontFamily: "'Nunito', sans-serif", marginTop: 6, lineHeight: 1.5 }}>
            Fill = Background above · Label = Text colour. Keep primary buttons on brand-token fills with high-contrast labels.
          </p>
        </div>
      )}

      {/* Typography */}
      <div style={S.row}>
        <p style={S.label}>Type {serifOnSmallUI && <span style={{ color: "#14655A" }}>· serif on small UI text</span>}{tinyText && <span style={{ color: "#14655A" }}> · below 10px</span>}</p>
        <select
          style={{ ...S.input, marginBottom: 8 }}
          value={isSerif ? BRAND_FONTS[0].css : BRAND_FONTS[1].css}
          onChange={(e) => setStyleProp("fontFamily", e.target.value)}
          title="Two fonts, two jobs: the Loud font for headlines, the Quiet font for UI (see canvas.config.ts)"
        >
          {BRAND_FONTS.map((f) => <option key={f.name} value={f.css}>{f.name} — {(f.job.split("—")[1] ?? f.job).split(".")[0].trim().slice(0, 34)}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...S.input, width: 90 }}
            defaultValue={o?.fontSize ?? info.fontSize}
            key={`fs-${selection.elementId}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (o?.fontSize ?? info.fontSize)) setFont("fontSize", /^\d+$/.test(v) ? `${v}px` : v); }}
          />
          <select
            style={{ ...S.input, width: 110 }}
            value={o?.fontWeight ?? info.fontWeight}
            onChange={(e) => setFont("fontWeight", e.target.value)}
          >
            {["300", "400", "500", "600", "700", "800"].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            style={{ ...S.input, width: 90 }}
            title="Letter-spacing (e.g. 0.15em for uppercase eyebrow labels)"
            placeholder="tracking"
            defaultValue={(o?.letterSpacing ?? info.letterSpacing) === "normal" ? "" : (o?.letterSpacing ?? info.letterSpacing)}
            key={`ls-${selection.elementId}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== ((o?.letterSpacing ?? info.letterSpacing) === "normal" ? "" : (o?.letterSpacing ?? info.letterSpacing))) setStyleProp("letterSpacing", v || "normal"); }}
          />
          <input
            style={{ ...S.input, width: 90 }}
            title="Line-height (e.g. 1.5 or 24px)"
            placeholder="leading"
            defaultValue={(o?.lineHeight ?? info.lineHeight) === "normal" ? "" : (o?.lineHeight ?? info.lineHeight)}
            key={`lh-${selection.elementId}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== ((o?.lineHeight ?? info.lineHeight) === "normal" ? "" : (o?.lineHeight ?? info.lineHeight))) setStyleProp("lineHeight", v || "normal"); }}
          />
          <select
            style={{ ...S.input, width: 100 }}
            title="Text transform"
            value={o?.textTransform ?? info.textTransform}
            onChange={(e) => setStyleProp("textTransform", e.target.value)}
          >
            {["none", "uppercase", "lowercase", "capitalize"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              title={`Align ${a}`}
              style={{ ...S.btn, flex: 1, background: (o?.textAlign ?? info.textAlign) === a ? "#111111" : "#fff", color: (o?.textAlign ?? info.textAlign) === a ? "#fff" : "#111" }}
              onClick={() => setStyleProp("textAlign", a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Position */}
      <div style={S.row}>
        <p style={S.label}>Nudge · offset ({o?.dx ?? 0}, {o?.dy ?? 0})</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 40px)", gap: 4 }}>
          <span />
          <button style={S.btn} onClick={() => nudge(0, -4)}>↑</button>
          <span />
          <button style={S.btn} onClick={() => nudge(-4, 0)}>←</button>
          <button style={S.btn} onClick={() => nudge(0, 4)}>↓</button>
          <button style={S.btn} onClick={() => nudge(4, 0)}>→</button>
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button
          style={{ ...S.btn, flex: 1 }}
          onClick={() => {
            const hidden = !!o?.hidden;
            store.applyOverride(
              selection.surfaceId, selection.elementId,
              hidden ? "show" : "hide", "visibility",
              { hidden }, { hidden: !hidden }, { hidden: !hidden },
              { elementRole: info.role, componentName: surface?.name },
            );
          }}
        >
          {o?.hidden ? "Show" : "Hide"}
        </button>
        <button
          style={{ ...S.btn, borderColor: "rgba(20,101,90,0.35)", color: "#14655A", flex: 1 }}
          onClick={() => {
            const el = insertedSpec ? null : findElement(selection.surfaceId, selection.elementId);
            const snapshot = insertedSpec
              ? { ...insertedSpec }
              : el
                ? { tag: el.tagName.toLowerCase(), text: (el.textContent ?? "").slice(0, 200), html: el.outerHTML.slice(0, 500) }
                : {};
            store.deleteElement(selection.surfaceId, selection.elementId, snapshot, { elementRole: info.role, componentName: surface?.name });
            store.select(selection.surfaceId);
          }}
        >
          Delete element
        </button>
        <button style={{ ...S.btn, flex: 1 }} onClick={() => store.undoLast()}>Undo last</button>
      </div>

      {/* Annotation pin — exported as a directive in the change log */}
      <div style={{ ...S.row, marginTop: 14 }}>
        <p style={S.label}>Annotate (directive for the coding agent)</p>
        <textarea
          key={`ann-${selection.elementId}`}
          placeholder="e.g. 'Increase tap target to 44pt' — Enter to pin"
          style={{ ...S.input, width: "100%", minHeight: 54, resize: "vertical", fontFamily: "inherit" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const v = (e.target as HTMLTextAreaElement).value.trim();
              if (!v) return;
              store.applyOverride(
                selection.surfaceId, selection.elementId,
                "annotate", "annotation", null, v, {},
                { elementRole: info.role, componentName: surface?.name, notes: `DIRECTIVE: ${v}` },
              );
              (e.target as HTMLTextAreaElement).value = "";
            }
          }}
        />
      </div>
    </div>
  );
}
