/**
 * CanvasPage — the Figma/Canva-style editor.
 * Layout: top toolbar · left workspace rail + panels · infinite canvas · right inspector.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfiniteCanvas, type CanvasApi } from "../canvas/InfiniteCanvas";
import { DeviceFrame, FRAME_W, FRAME_H } from "../canvas/DeviceFrame";
import { layoutWorkspace, findPlacement } from "../canvas/layout";
import { FlowArrows } from "../canvas/FlowArrows";
import { Inspector } from "../canvas/Inspector";
import { FlowTree, ChangeLogPanel, SessionsPanel, SearchResults, InsertMenu } from "../canvas/Panels";
import { WORKSPACES, SURFACES, getSurface, type WorkspaceId } from "../canvas/registry";
import { CanvasStoreProvider, useCanvasStore, useCanvasState } from "../canvas/store";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import config from "../../../canvas.config";

const FONT = "'Nunito', sans-serif";
const btn = (active?: boolean): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: FONT,
  border: active ? "1px solid #111" : "1px solid rgba(17,17,17,0.12)",
  background: active ? "#111111" : "#FFFFFF", color: active ? "#FFFFFF" : "#111111",
  cursor: "pointer", whiteSpace: "nowrap", transition: "all 140ms cubic-bezier(0.23,1,0.32,1)",
});

type PanelTab = "flow" | "changes" | "sessions";

// ── First-run tour ──────────────────────────────────────────────────────────
const TOUR_KEY = "design-canvas-tour-done";
const TOUR_STEPS: { title: string; body: string }[] = [
  { title: "Every screen, one canvas", body: "Every customer-facing surface is laid out in flow rows inside iPhone frames. Scroll to zoom, drag the background to pan, and switch stakeholder workspaces on the left rail." },
  { title: "Edit like Canva", body: "Click any element to select it. Double-click text to rewrite it inline. Drag a selected element to move it, use the corner handle to resize, and the right inspector for colours (brand tokens first), type, hide/show, and annotations." },
  { title: "Follow the flow", body: "Toggle Flows to see flow arrows from each button to its destination screen — hover an arrow for the '→ NextScreen' badge. Turn on ▶ Play and click buttons inside frames to travel the real journey." },
  { title: "Everything is logged", body: "Every add, edit, delete, move, resize, hide, and annotation lands in the Changes panel with exact file:line anchors. Export JSON/Markdown for your coding agent, or file a GitHub issue in one click (configure the repo in canvas.config.ts). Hit Save session to snapshot a review pass." },
];

function TourOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = TOUR_STEPS[step];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(17,17,17,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onDone}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, background: "#FFFFFF", borderRadius: 16, padding: "28px 30px 22px", boxShadow: "0 32px 90px rgba(0,0,0,0.35)", fontFamily: FONT }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#14655A" }}>Welcome · {step + 1}/{TOUR_STEPS.length}</p>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: "#111111", margin: "8px 0 10px" }}>{s.title}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "rgba(17,17,17,0.7)" }}>{s.body}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22 }}>
          <button style={{ ...btn(), border: "none", color: "rgba(17,17,17,0.45)" }} onClick={onDone}>Skip tour</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && <button style={btn()} onClick={() => setStep(step - 1)}>Back</button>}
            <button style={{ ...btn(true), background: "#14655A", border: "1px solid #14655A" }} onClick={() => (step < TOUR_STEPS.length - 1 ? setStep(step + 1) : onDone())}>
              {step < TOUR_STEPS.length - 1 ? "Next" : "Start reviewing"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasPageInner() {
  const store = useCanvasStore();
  const [ws, setWs] = useState<WorkspaceId>(() => {
    // Deep-linkable workspace: /?ws=<workspaceId>
    const q = new URLSearchParams(window.location.search).get("ws");
    return q && WORKSPACES.some((w) => w.id === q) ? (q as WorkspaceId) : "growth";
  });
  const [panelTab, setPanelTab] = useState<PanelTab>("changes");
  const [query, setQuery] = useState("");
  const [insertOpen, setInsertOpen] = useState(false);
  const [showTour, setShowTour] = useState(() => {
    try { return localStorage.getItem(TOUR_KEY) !== "1"; } catch { return false; }
  });
  const dismissTour = () => { setShowTour(false); try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ } };
  const apiRef = useRef<CanvasApi | null>(null);
  const showFlows = useCanvasState((s) => s.showFlows);
  const playMode = useCanvasState((s) => s.playMode);
  const darkMode = useCanvasState((s) => s.darkMode);
  const dynamicType = useCanvasState((s) => s.dynamicType);
  const selectedSurface = useCanvasState((s) => s.selectedSurface);
  const changeLog = useCanvasState((s) => s.changeLog);
  const dirty = useCanvasState((s) => s.dirty);
  const beforeAfter = useCanvasState((s) => s.beforeAfter);

  const { placed, rows, width, height } = useMemo(() => layoutWorkspace(ws), [ws]);

  // ── Persistence ─────────────────────────────────────────────────────────
  const stateQuery = trpc.canvas.get.useQuery(undefined, { refetchOnWindowFocus: false, retry: 1 });
  const saveMutation = trpc.canvas.save.useMutation();
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (stateQuery.data && !hydratedRef.current) {
      hydratedRef.current = true;
      store.hydrate(stateQuery.data as never);
    }
  }, [stateQuery.data, store]);

  // Autosave (debounced) so preview devices stay live
  useEffect(() => {
    if (!dirty || !hydratedRef.current) return;
    const t = setTimeout(() => {
      const s = store.getState();
      saveMutation.mutate({ overrides: s.overrides, inserted: s.inserted, changeLog: s.changeLog, sessions: s.sessions } as never);
    }, 1200);
    return () => clearTimeout(t);
  }, [changeLog, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSession = () => {
    // F21 guard: zero-change save is a no-op — never write an empty session entry.
    const st = store.getState();
    const lastSaved = st.sessions.at(-1);
    const sinceIdx = lastSaved ? st.changeLog.findIndex((c) => c.id === lastSaved.changeIds.at(-1)) + 1 : 0;
    if (st.changeLog.slice(sinceIdx).length === 0) {
      toast.info("Nothing new to save — make an edit first.");
      return;
    }
    const label = window.prompt("Session label (what did you review/change?)", "");
    if (label === null) return;
    store.saveSession(label || `Session ${new Date().toLocaleString()}`);
    const s = store.getState();
    saveMutation.mutate({ overrides: s.overrides, inserted: s.inserted, changeLog: s.changeLog, sessions: s.sessions } as never);
    setPanelTab("sessions");
    toast.success("Session saved");
  };

  // ── Camera helpers ──────────────────────────────────────────────────────
  const jumpTo = useCallback((surfaceId: string) => {
    const s = getSurface(surfaceId);
    if (!s) return;
    if (s.workspace !== ws) {
      setWs(s.workspace);
      // wait for relayout, then zoom
      setTimeout(() => {
        const p = findPlacement(layoutWorkspace(s.workspace).placed, surfaceId);
        if (p) apiRef.current?.zoomTo(p.x, p.y, FRAME_W + 24, FRAME_H + 24, { animate: true, pad: 120 });
      }, 90);
    } else {
      const p = findPlacement(placed, surfaceId);
      if (p) apiRef.current?.zoomTo(p.x, p.y, FRAME_W + 24, FRAME_H + 24, { animate: true, pad: 120 });
    }
    store.select(surfaceId);
    setQuery("");
  }, [ws, placed, store]);

  // Play mode navigation
  const onNavigate = useCallback((toSurfaceId: string) => {
    jumpTo(toSurfaceId);
  }, [jumpTo]);

  // Keyboard: arrows nudge, delete, cmd+z / cmd+y / cmd+s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S saves everywhere — even while typing in a text field
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const s = store.getState();
        saveMutation.mutate(
          { overrides: s.overrides, inserted: s.inserted, changeLog: s.changeLog, sessions: s.sessions } as never,
          {
            onSuccess: () => toast.success("Saved — your changes survive refresh", { id: "kbd-save", duration: 2500 }),
            onError: (err) => toast.error("Save failed", { id: "kbd-save", description: err.message.slice(0, 120) }),
          },
        );
        return;
      }
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable]")) return;
      const sel = store.getState().selection;
      // Redo: Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault(); store.redoLast(); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); store.undoLast(); return; }
      if (!sel) return;
      const step = e.shiftKey ? 10 : 1;
      const o = store.getState().overrides[`${sel.surfaceId}::${sel.elementId}`];
      const dx = o?.dx ?? 0, dy = o?.dy ?? 0;
      const nudge = (nx: number, ny: number) => {
        e.preventDefault();
        store.applyOverride(sel.surfaceId, sel.elementId, "move", "position", { dx, dy }, { dx: nx, dy: ny }, { dx: nx, dy: ny });
      };
      if (e.key === "ArrowUp") nudge(dx, dy - step);
      else if (e.key === "ArrowDown") nudge(dx, dy + step);
      else if (e.key === "ArrowLeft") nudge(dx - step, dy);
      else if (e.key === "ArrowRight") nudge(dx + step, dy);
      else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        store.deleteElement(sel.surfaceId, sel.elementId, { via: "keyboard" });
        store.select(sel.surfaceId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const changesByWs = useMemo(() => {
    const m: Record<string, number> = {};
    changeLog.forEach((c) => { m[c.workspace] = (m[c.workspace] ?? 0) + 1; });
    return m;
  }, [changeLog]);

  const selDef = selectedSurface ? getSurface(selectedSurface) : null;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#E9E7E2", overflow: "hidden" }}>
      {showTour && <TourOverlay onDone={dismissTour} />}
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ height: 54, background: "#FFFFFF", borderBottom: "1px solid rgba(17,17,17,0.08)", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", zIndex: 100, flexShrink: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginRight: 4 }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", color: "#111" }}>{config.projectName}</span>
          <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#14655A" }}>canvas</span>
        </span>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all workspaces…"
            style={{ width: 210, padding: "8px 12px", borderRadius: 9, border: "1px solid rgba(17,17,17,0.12)", fontSize: 12.5, fontFamily: FONT, outline: "none", background: "#F7F6F4" }}
          />
          <SearchResults query={query} onJump={jumpTo} />
        </div>

        <div style={{ width: 1, height: 26, background: "rgba(17,17,17,0.08)" }} />

        <button style={btn()} onClick={() => apiRef.current?.fitAll()}>Fit all</button>
        <button style={btn(showFlows)} onClick={() => store.toggleFlows()}>Flows</button>
        <button style={btn(playMode)} onClick={() => store.setPlayMode(!playMode)} title="Click buttons inside frames to travel to the destination screen">▶ Play</button>
        <button style={btn(darkMode)} onClick={() => store.toggleDark()}>Dark</button>
        <button style={btn(dynamicType)} onClick={() => store.toggleDynamicType()} title="Dynamic Type stress test">Aa+</button>
        <a href={`/ios/${selDef?.id ?? SURFACES[0]?.id ?? ""}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none", display: "inline-block" }} title="Xcode-simulator-style preview of the generated SwiftUI, with live parity audit"> iOS</a>
        {selDef && (
          <>
            <button style={btn(!!beforeAfter[selDef.id])} onClick={() => store.toggleBeforeAfter(selDef.id)} title="Toggle before/after for the selected surface">Before/After</button>
            <div style={{ position: "relative" }}>
              <button style={btn()} onClick={() => setInsertOpen((v) => !v)}>+ Insert</button>
              {insertOpen && <InsertMenu surfaceId={selDef.id} onClose={() => setInsertOpen(false)} />}
            </div>
            <a href={`/preview/${selDef.id}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>Live preview ↗</a>
          </>
        )}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: dirty ? "#14655A" : "rgba(17,17,17,0.4)", fontFamily: FONT, fontWeight: 700 }}>
          {saveMutation.isPending ? "Syncing…" : dirty ? "Unsaved changes" : "Synced"}
        </span>
        <button
          style={{ ...btn(true), background: "#14655A", border: "1px solid #14655A", padding: "9px 18px" }}
          onClick={saveSession}
        >
          Save session
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
        {/* ── Left rail: workspaces ─────────────────────────────────────── */}
        <div style={{ width: 230, background: "#FFFFFF", borderRight: "1px solid rgba(17,17,17,0.08)", display: "flex", flexDirection: "column", zIndex: 90, flexShrink: 0 }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(17,17,17,0.4)", fontFamily: FONT, padding: "14px 16px 6px" }}>Workspaces</p>
          {WORKSPACES.map((w) => {
            const count = SURFACES.filter((s) => s.workspace === w.id).length;
            const chg = changesByWs[w.id] ?? 0;
            const active = ws === w.id;
            return (
              <div
                key={w.id}
                onClick={() => { setWs(w.id); store.select(null); setTimeout(() => apiRef.current?.fitAll(), 80); }}
                style={{
                  padding: "9px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  background: active ? "rgba(17,17,17,0.05)" : "transparent",
                  borderLeft: active ? "3px solid #14655A" : "3px solid transparent",
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: active ? 800 : 600, fontFamily: FONT, color: "#111" }}>{w.name}</p>
                  <p style={{ fontSize: 10.5, color: "rgba(17,17,17,0.4)", fontFamily: FONT }}>{count}/{w.cap} surfaces</p>
                </div>
                {chg > 0 && (
                  <span style={{ background: "#14655A", color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: FONT, borderRadius: 100, padding: "2px 8px" }}>{chg}</span>
                )}
              </div>
            );
          })}

          {/* Panel tabs */}
          <div style={{ display: "flex", borderTop: "1px solid rgba(17,17,17,0.08)", marginTop: 10 }}>
            {([["flow", "Flow"], ["changes", "Changes"], ["sessions", "Saves"]] as [PanelTab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setPanelTab(t)} style={{
                flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 800, fontFamily: FONT, letterSpacing: "0.06em", textTransform: "uppercase",
                border: "none", cursor: "pointer",
                background: panelTab === t ? "#111111" : "transparent", color: panelTab === t ? "#fff" : "rgba(17,17,17,0.45)",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {panelTab === "flow" && <FlowTree onJump={jumpTo} />}
            {panelTab === "changes" && <ChangeLogPanel onJump={jumpTo} />}
            {panelTab === "sessions" && <SessionsPanel />}
          </div>
        </div>

        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative" }}>
          <InfiniteCanvas
            contentWidth={width}
            contentHeight={height}
            onReady={(api) => { apiRef.current = api; }}
            onBackgroundClick={() => store.select(null)}
          >
            {(visible, zoom) => (
              <>
                {/* Row labels */}
                {rows.map((r) => (
                  <div key={r.label} data-fd-canvas-bg style={{ position: "absolute", left: 80, top: r.y, fontFamily: FONT, fontSize: 26, fontWeight: 800, letterSpacing: "0.02em", color: "rgba(17,17,17,0.35)", textTransform: "uppercase" }}>
                    {r.label}
                  </div>
                ))}
                {showFlows && <FlowArrows placed={placed} width={width} height={height} />}
                {placed.map((p) => {
                  const isVisible = visible(p.x, p.y, FRAME_W + 24, FRAME_H + 24);
                  const isSel = selectedSurface === p.surface.id;
                  return (
                    <div key={p.surface.id} style={{ position: "absolute", left: p.x, top: p.y }}>
                      {/* Frame label */}
                      <div
                        data-fd-canvas-bg={undefined}
                        onClick={() => { store.select(p.surface.id); }}
                        onDoubleClick={() => apiRef.current?.zoomTo(p.x, p.y, FRAME_W + 24, FRAME_H + 24, { animate: true, pad: 100 })}
                        style={{ position: "absolute", top: -44, left: 4, cursor: "pointer", display: "flex", gap: 8, alignItems: "baseline", whiteSpace: "nowrap" }}
                      >
                        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: isSel ? "#14655A" : "rgba(17,17,17,0.75)" }}>{p.surface.name}</span>
                        <span style={{ fontFamily: FONT, fontSize: 15, color: "rgba(17,17,17,0.38)" }}>{p.surface.type !== "screen" ? p.surface.type : p.surface.route}</span>
                        {(changeLog.some((c) => c.surface === p.surface.id)) && (
                          <span style={{ width: 10, height: 10, borderRadius: 5, background: "#14655A", display: "inline-block" }} />
                        )}
                      </div>
                      {isVisible ? (
                        <div style={{ outline: isSel ? "3px solid #14655A" : "none", outlineOffset: 8, borderRadius: 64 }}>
                          <DeviceFrame surface={p.surface} editable={zoom > 0.25} onNavigate={onNavigate} />
                        </div>
                      ) : (
                        <div style={{ width: FRAME_W + 24, height: FRAME_H + 24, borderRadius: 64, background: "rgba(17,17,17,0.05)", border: "1px solid rgba(17,17,17,0.07)" }} />
                      )}
                      {/* Click-to-select veil at low zoom */}
                      {isVisible && zoom <= 0.25 && (
                        <div
                          onClick={() => store.select(p.surface.id)}
                          onDoubleClick={() => apiRef.current?.zoomTo(p.x, p.y, FRAME_W + 24, FRAME_H + 24, { animate: true, pad: 100 })}
                          style={{ position: "absolute", inset: 0, cursor: "pointer", borderRadius: 64 }}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </InfiniteCanvas>

          {/* Play mode banner */}
          {playMode && (
            <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#111111", color: "#fff", borderRadius: 100, padding: "9px 20px", fontSize: 12.5, fontFamily: FONT, fontWeight: 700, zIndex: 120, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
              ▶ Play mode — click buttons inside frames to fly to the next screen · <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => store.setPlayMode(false)}>exit</span>
            </div>
          )}
        </div>

        {/* ── Right inspector ───────────────────────────────────────────── */}
        <div style={{ width: 280, background: "#FFFFFF", borderLeft: "1px solid rgba(17,17,17,0.08)", zIndex: 90, flexShrink: 0, overflow: "hidden" }}>
          <Inspector />
        </div>
      </div>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <CanvasStoreProvider>
      <CanvasPageInner />
    </CanvasStoreProvider>
  );
}
