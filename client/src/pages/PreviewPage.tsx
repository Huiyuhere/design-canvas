/**
 * PreviewPage — /preview/:surfaceId
 * Full-screen live preview of one surface with all canvas overrides applied.
 * Open it on a phone/tablet: it polls saved state so edits stream in live.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { getMount } from "../canvas/mounts";
import { getSurface, SURFACES } from "../canvas/registry";
import { CanvasStoreProvider, useCanvasStore, useCanvasState } from "../canvas/store";
import { instrumentSurface, hasDirectText } from "../canvas/instrument";
import { isRichText, sanitizeRich } from "../../../shared/richtext";
import { trpc } from "@/lib/trpc";

const FONT = "'Nunito', sans-serif";

function PreviewInner({ surfaceId }: { surfaceId: string }) {
  const store = useCanvasStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const overrides = useCanvasState((s) => s.overrides);
  const inserted = useCanvasState((s) => s.inserted);
  const surface = getSurface(surfaceId);
  const mount = getMount(surfaceId);

  // Live sync: poll server state every 2s
  const stateQuery = trpc.canvas.get.useQuery(undefined, { refetchInterval: 2000, refetchOnWindowFocus: true, retry: 1 });
  useEffect(() => {
    if (stateQuery.data) store.hydrate(stateQuery.data as never);
  }, [stateQuery.data, store]);

  // Instrument + apply overrides
  useEffect(() => {
    const apply = () => {
      const root = rootRef.current;
      if (!root) return;
      instrumentSurface(root, surfaceId);
      const els = root.querySelectorAll<HTMLElement>("[data-fd-id]");
      els.forEach((el) => {
        const o = overrides[`${surfaceId}::${el.dataset.fdId}`] ?? overrides[`*::${el.dataset.fdId}`];
        if (!o) return;
        if (o.text !== undefined) {
          if (isRichText(o.text) || o.text.includes("\n")) {
            const html = sanitizeRich(o.text.replace(/\n/g, "<br>"));
            if (el.dataset.fdRich !== html) { el.innerHTML = html; el.dataset.fdRich = html; }
            // Paint span-level colours (data-c) — parity with DeviceFrame.paintColorSpans
            el.querySelectorAll<HTMLElement>("strong[data-c], em[data-c]").forEach((s) => {
              const hex = s.dataset.c ?? "";
              if (/^#[0-9A-Fa-f]{6}$/.test(hex)) s.style.color = hex;
            });
          } else if (hasDirectText(el)) {
            const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
            if (textNodes[0] && textNodes[0].textContent !== o.text) {
              textNodes[0].textContent = o.text;
              textNodes.slice(1).forEach((n) => { n.textContent = ""; });
            }
          }
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
        if (o.dx || o.dy) el.style.transform = `translate(${o.dx ?? 0}px, ${o.dy ?? 0}px)`;
        if (o.w) el.style.width = `${o.w}px`;
        if (o.h) el.style.height = `${o.h}px`;
        el.style.display = o.hidden ? "none" : "";
      });
    };
    const t = setInterval(apply, 500);
    apply();
    return () => clearInterval(t);
  }, [overrides, surfaceId]);

  if (!surface || !mount) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F4F4", fontFamily: FONT, gap: 12, padding: 24 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>Unknown surface "{surfaceId}"</p>
        <div style={{ maxWidth: 420, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {SURFACES.slice(0, 20).map((s) => (
            <a key={s.id} href={`/preview/${s.id}`} style={{ fontSize: 11.5, color: "#14655A", fontFamily: FONT }}>{s.id}</a>
          ))}
        </div>
      </div>
    );
  }

  const ins = Object.values(inserted).filter((i) => i.surfaceId === surfaceId);

  // ?dark=1 — mirror the canvas Dark toggle on the live preview route so the
  // dark treatment (incl. the fd-artwork smart-invert exemption) can be
  // reviewed and screenshot-verified outside the canvas.
  const dark = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dark") === "1";

  return (
    <div
      ref={rootRef}
      data-fd-dark={dark ? "true" : undefined}
      style={{
        minHeight: "100vh",
        background: "#F4F4F4",
        position: "relative",
        // Same cheap-negative dark filter as DeviceFrame; fd-artwork imgs are
        // counter-inverted by the index.css exemption rule.
        filter: dark ? "invert(0.92) hue-rotate(180deg)" : undefined,
      }}
    >
      {mount.render()}
      {ins.map((i) => (
        <div key={i.elementId} style={{
          position: "fixed", left: i.dx, top: i.dy, zIndex: 60,
          padding: i.kind === "button" ? "12px 24px" : "4px 8px",
          borderRadius: i.kind === "button" ? 100 : 6,
          background: i.background, color: i.color, fontSize: i.fontSize,
          fontFamily: i.kind === "note" ? FONT : "'Times New Roman', Georgia, serif",
          border: i.kind === "note" ? "1px dashed rgba(139,26,46,0.5)" : "none",
        }}>{i.text}</div>
      ))}
      {/* Surface switcher pill — bottom-center so it never overlaps vendored headers */}
      <div style={{ position: "fixed", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 2147483000, display: "flex", alignItems: "center", gap: 6, background: "rgba(17,17,17,0.88)", backdropFilter: "blur(12px)", borderRadius: 100, padding: "6px 10px", boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontFamily: FONT }}>Preview</span>
        <select
          value={surfaceId}
          onChange={(e) => { window.location.href = `/preview/${e.target.value}`; }}
          style={{ fontSize: 12, fontFamily: FONT, fontWeight: 700, padding: "4px 6px", borderRadius: 100, border: "none", background: "transparent", color: "#fff", maxWidth: 190, outline: "none" }}
        >
          {SURFACES.map((s) => <option key={s.id} value={s.id} style={{ color: "#111" }}>{s.name}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function PreviewPage() {
  const params = useParams<{ surfaceId: string }>();
  return (
    <CanvasStoreProvider>
      <PreviewInner surfaceId={params.surfaceId ?? ""} />
    </CanvasStoreProvider>
  );
}
