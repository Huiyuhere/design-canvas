/**
 * IOSPreviewPage — /ios/:surfaceId
 *
 * Xcode-simulator-style preview of the converted SwiftUI output:
 *   LEFT  — the React surface (the simulation, overrides applied) rendered
 *           off-screen-style inside a hidden stage, snapshotted on load
 *   MIDDLE— an iOS Simulator-chrome device rendering the SNAPSHOT (the exact
 *           boxes/fonts/colors/images the generated Swift positions — i.e.
 *           what Xcode's canvas would show for the generated view)
 *   RIGHT — the generated .swift source + live parity audit result
 *
 * The middle pane draws ONLY from the SurfaceSnapshot (absolute boxes,
 *  computed styles) — never from the React tree — so what you see is what
 * the generated SwiftUI ZStack encodes, and the parity audit's PASS applies
 * to the pixels on screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import config from "../../../canvas.config";
import { generateSwift, viewNameFor } from "../../../shared/swiftgen";
import { auditParity, type ParityIssue } from "../../../shared/swiftparity";
import type { SnapshotNode, SurfaceSnapshot } from "../../../shared/uiSnapshot";
import { captureSnapshot } from "../canvas/snapshot";
import { getMount } from "../canvas/mounts";
import { getSurface, SURFACES } from "../canvas/registry";
import { CanvasStoreProvider, useCanvasStore } from "../canvas/store";
import { applyOverridesToDom } from "../canvas/applyOverrides";
import { trpc } from "@/lib/trpc";

const FONT = config.uiFont;
const DEV_W = config.device.width;
const DEV_H = config.device.height;

/** Render a snapshot node exactly as the generated SwiftUI ZStack would. */
function SnapNode({ n }: { n: SnapshotNode }) {
  const isTextLeaf = (n.kind === "text" || n.kind === "button" || (n.kind === "input" && n.text)) && n.text !== null && n.textStyle;
  const isImage = n.kind === "image" && n.imageSrc;
  const decorated = n.background || n.border || n.borderRadiusPx > 0;
  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: n.box.x,
    top: n.box.y,
    width: n.box.w,
    height: n.box.h,
    opacity: n.opacity < 1 ? n.opacity : undefined,
  };
  if (isTextLeaf) {
    const t = n.textStyle!;
    let text = n.text ?? "";
    if (t.textTransform === "uppercase") text = text.toUpperCase();
    if (t.textTransform === "lowercase") text = text.toLowerCase();
    return (
      <div
        style={{
          ...boxStyle,
          background: n.background ?? undefined,
          borderRadius: n.borderRadiusPx || undefined,
          border: n.border ? `${n.border.widthPx}px solid ${n.border.color}` : undefined,
          fontFamily: t.fontFamily,
          fontSize: t.fontSizePx,
          fontWeight: t.fontWeight,
          fontStyle: t.fontStyle,
          color: t.color,
          letterSpacing: t.letterSpacingPx ? `${t.letterSpacingPx}px` : undefined,
          lineHeight: t.lineHeightPx ? `${t.lineHeightPx}px` : undefined,
          textAlign: t.textAlign,
          textDecoration: t.textDecoration !== "none" ? t.textDecoration : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: t.textAlign === "center" ? "center" : t.textAlign === "right" ? "flex-end" : "flex-start",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
        }}
      >
        {text}
      </div>
    );
  }
  if (isImage) {
    return (
      <img
        src={n.imageSrc!}
        alt=""
        style={{
          ...boxStyle,
          objectFit: n.imageMode === "contain" ? "contain" : n.imageMode === "fill" ? "fill" : "cover",
          borderRadius: n.borderRadiusPx || undefined,
          border: n.border ? `${n.border.widthPx}px solid ${n.border.color}` : undefined,
        }}
      />
    );
  }
  return (
    <>
      {decorated && (
        <div
          style={{
            ...boxStyle,
            background: n.background ?? undefined,
            borderRadius: n.borderRadiusPx || undefined,
            border: n.border ? `${n.border.widthPx}px solid ${n.border.color}` : undefined,
          }}
        />
      )}
      {n.children.map((c, i) => (
        <SnapNode key={i} n={c} />
      ))}
    </>
  );
}

/** iOS Simulator window chrome around the snapshot-rendered device. */
function SimulatorFrame({ snap, scale }: { snap: SurfaceSnapshot; scale: number }) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 18px 60px rgba(0,0,0,0.35)", background: "#3E3E42", width: DEV_W * scale + 4 }}>
      {/* Simulator title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", background: "linear-gradient(#4A4A4E, #3E3E42)" }}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FEBC2E" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28C840" }} />
        <span style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.75)", fontFamily: FONT }}>
          iPhone 15 Pro — {viewNameFor(snap.surfaceId)}.swift (Generated)
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: FONT }}>100%</span>
      </div>
      {/* Device screen: rendered purely from the snapshot */}
      <div style={{ margin: 2, borderRadius: 8, overflow: "hidden", background: "#000" }}>
        <div style={{ width: DEV_W * scale, height: DEV_H * scale, overflow: "hidden" }}>
          <div style={{ width: DEV_W, height: DEV_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative", background: snap.root.background ?? "#fff" }}>
            {snap.root.children.map((c, i) => (
              <SnapNode key={i} n={c} />
            ))}
            {/* Status bar + home indicator overlay, as the simulator shows */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 54, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: 120, height: 34, background: "#000", borderRadius: 20, marginTop: 11 }} />
            </div>
            <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 140, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.85)", pointerEvents: "none" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function IOSPreviewInner({ surfaceId }: { surfaceId: string }) {
  const store = useCanvasStore();
  const stageRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<SurfaceSnapshot | null>(null);
  const [issues, setIssues] = useState<ParityIssue[] | null>(null);
  const [copied, setCopied] = useState(false);
  const surface = getSurface(surfaceId);
  const mount = getMount(surfaceId);

  const stateQuery = trpc.canvas.get.useQuery(undefined, { retry: 1 });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (stateQuery.data) {
      store.hydrate(stateQuery.data as never);
      setHydrated(true);
    }
    if (stateQuery.isError) setHydrated(true);
  }, [stateQuery.data, stateQuery.isError, store]);

  // Once hydrated + rendered: apply overrides to the hidden stage, then capture.
  useEffect(() => {
    if (!hydrated || !surface || !mount) return;
    const stage = stageRef.current;
    if (!stage) return;
    const timer = setTimeout(() => {
      applyOverridesToDom(stage, surfaceId, store.getState().overrides, store.getState().inserted);
      // Give images/fonts a beat to settle before measuring.
      setTimeout(() => {
        try {
          const s = captureSnapshot(stage, surfaceId, surface.name);
          setSnap(s);
          setIssues(auditParity(s, generateSwift(s)));
          // CLI hook: scripts/swift-export.ts polls this from headless Chromium.
          (window as never as { __fdSnapshot?: unknown }).__fdSnapshot = s;
        } catch (e) {
          console.error("snapshot failed", e);
        }
      }, 350);
    }, 150);
    return () => clearTimeout(timer);
  }, [hydrated, surfaceId, surface, mount, store]);

  const swift = useMemo(() => (snap ? generateSwift(snap) : ""), [snap]);

  if (!surface || !mount) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1E1E1E", color: "#ccc", fontFamily: FONT }}>
        <p>
          Unknown surface "{surfaceId}" — <a href="/" style={{ color: "#6FCF97" }}>back to canvas</a>
        </p>
      </div>
    );
  }

  const pass = issues !== null && issues.length === 0;
  const scale = 0.62;

  return (
    <div style={{ minHeight: "100vh", background: "#1E1E1E", fontFamily: FONT, color: "#D4D4D4", display: "flex", flexDirection: "column" }}>
      {/* Xcode-style toolbar */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#2D2D30", borderBottom: "1px solid #1A1A1C" }}>
        <a href="/" style={{ fontSize: 12, color: "#9CDCFE", textDecoration: "none" }}>← Canvas</a>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#E8E8E8" }}>{config.projectName} — iOS Preview</span>
        <select
          value={surfaceId}
          onChange={(e) => (window.location.href = `/ios/${e.target.value}`)}
          style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #444", background: "#1E1E1E", color: "#D4D4D4", fontFamily: FONT }}
        >
          {SURFACES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "4px 12px",
            borderRadius: 100,
            background: issues === null ? "#3A3A3C" : pass ? "rgba(40,200,64,0.15)" : "rgba(255,95,87,0.15)",
            color: issues === null ? "#999" : pass ? "#28C840" : "#FF5F57",
          }}
        >
          {issues === null ? "AUDITING…" : pass ? "PARITY PASS — matches simulation exactly" : `PARITY FAIL — ${issues.length} mismatch(es)`}
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(swift).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          disabled={!snap}
          style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 14px", borderRadius: 6, border: "1px solid #444", background: "#0E639C", color: "#fff", cursor: "pointer", fontFamily: FONT }}
        >
          {copied ? "Copied" : "Copy .swift"}
        </button>
        <button
          onClick={() => {
            const blob = new Blob([swift], { type: "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${viewNameFor(surfaceId)}.swift`;
            a.click();
          }}
          disabled={!snap}
          style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 14px", borderRadius: 6, border: "1px solid #444", background: "#333", color: "#ddd", cursor: "pointer", fontFamily: FONT }}
        >
          Download
        </button>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${surfaceId}.snapshot.json`;
            a.click();
          }}
          disabled={!snap}
          style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 14px", borderRadius: 6, border: "1px solid #444", background: "#333", color: "#ddd", cursor: "pointer", fontFamily: FONT }}
          title="Snapshot JSON for offline swift:export --from-json"
        >
          Snapshot
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", gap: 20, padding: 20, alignItems: "flex-start", overflow: "auto" }}>
        {/* LEFT: React simulation (visible reference) */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A8E", margin: "0 0 8px 2px" }}>React simulation (source of truth)</p>
          <div style={{ width: DEV_W * scale, height: DEV_H * scale, overflow: "hidden", borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
            <div ref={stageRef} style={{ width: DEV_W, height: DEV_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative", overflow: "hidden", background: "#fff" }}>
              {mount.render()}
            </div>
          </div>
        </div>

        {/* MIDDLE: simulator rendering of the generated Swift's geometry */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A8E", margin: "0 0 8px 2px" }}>Generated SwiftUI (simulator preview)</p>
          {snap ? (
            <SimulatorFrame snap={snap} scale={scale} />
          ) : (
            <div style={{ width: DEV_W * scale, height: DEV_H * scale, display: "flex", alignItems: "center", justifyContent: "center", background: "#2A2A2C", borderRadius: 10, fontSize: 12, color: "#777" }}>
              Capturing snapshot…
            </div>
          )}
        </div>

        {/* RIGHT: Swift source + audit detail */}
        <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A8E", margin: "0 0 -4px 2px" }}>{viewNameFor(surfaceId)}.swift</p>
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: "#252526",
              border: "1px solid #333",
              borderRadius: 10,
              fontSize: 11,
              lineHeight: 1.5,
              fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
              color: "#CE9178",
              overflow: "auto",
              maxHeight: DEV_H * scale - (issues && issues.length > 0 ? 180 : 40),
              whiteSpace: "pre",
            }}
          >
            {swift || "// Generating…"}
          </pre>
          {issues !== null && issues.length > 0 && (
            <div style={{ padding: 14, background: "rgba(255,95,87,0.08)", border: "1px solid rgba(255,95,87,0.35)", borderRadius: 10, maxHeight: 160, overflow: "auto" }}>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 800, color: "#FF5F57" }}>Parity mismatches</p>
              {issues.map((i, k) => (
                <p key={k} style={{ margin: "0 0 4px", fontSize: 11, color: "#E8A9A5", fontFamily: "'SF Mono', Menlo, monospace" }}>
                  [{i.dimension}] {i.element}: expected {i.expected}, got {i.actual}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IOSPreviewPage() {
  const params = useParams<{ surfaceId: string }>();
  return (
    <CanvasStoreProvider>
      <IOSPreviewInner surfaceId={params.surfaceId ?? ""} />
    </CanvasStoreProvider>
  );
}
