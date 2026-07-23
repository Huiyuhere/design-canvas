/**
 * InfiniteCanvas — Figma/Canva-style viewport.
 * - wheel / pinch-trackpad: zoom around cursor
 * - space-drag or middle-drag or two-finger scroll: pan
 * - fit-all, zoom-to-surface, animated camera for Play mode
 * - virtualization: frames outside viewport render placeholders
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface Camera { x: number; y: number; z: number }

export interface CanvasApi {
  fitAll: () => void;
  zoomTo: (x: number, y: number, w: number, h: number, opts?: { animate?: boolean; pad?: number }) => void;
  getCamera: () => Camera;
}

interface Props {
  contentWidth: number;
  contentHeight: number;
  children: (visible: (x: number, y: number, w: number, h: number) => boolean, zoom: number) => ReactNode;
  onReady?: (api: CanvasApi) => void;
  onBackgroundClick?: () => void;
}

const MIN_Z = 0.04;
const MAX_Z = 2.5;

export function InfiniteCanvas({ contentWidth, contentHeight, children, onReady, onBackgroundClick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 0.12 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const [spaceDown, setSpaceDown] = useState(false);
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);
  const animRef = useRef<number | null>(null);

  const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

  const fitAll = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const { clientWidth: vw, clientHeight: vh } = el;
    const z = clampZ(Math.min(vw / contentWidth, vh / contentHeight) * 0.94);
    setCam({ x: (vw - contentWidth * z) / 2, y: (vh - contentHeight * z) / 2 + 10, z });
  }, [contentWidth, contentHeight]);

  const zoomTo = useCallback((x: number, y: number, w: number, h: number, opts?: { animate?: boolean; pad?: number }) => {
    const el = wrapRef.current;
    if (!el) return;
    const pad = opts?.pad ?? 80;
    const { clientWidth: vw, clientHeight: vh } = el;
    const z = clampZ(Math.min(vw / (w + pad * 2), vh / (h + pad * 2)));
    const target: Camera = { x: vw / 2 - (x + w / 2) * z, y: vh / 2 - (y + h / 2) * z, z };
    if (!opts?.animate) { setCam(target); return; }
    // animate camera
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = { ...camRef.current };
    const t0 = performance.now();
    const dur = 620;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const k = ease(t);
      setCam({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, z: from.z + (target.z - from.z) * k });
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    onReady?.({ fitAll, zoomTo, getCamera: () => camRef.current });
  }, [fitAll, zoomTo, onReady]);

  // Initial fit — ONCE per mount only. Never refit because of rerenders
  // (edits to text/color/position rerender the page and must not move the
  // camera). Workspace switches remount/refit via explicit fitAll() calls.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    const t = setTimeout(fitAll, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel: zoom (ctrl/meta or pinch) or pan
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = camRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0022);
        const nz = clampZ(c.z * factor);
        const wx = (px - c.x) / c.z;
        const wy = (py - c.y) / c.z;
        setCam({ x: px - wx * nz, y: py - wy * nz, z: nz });
      } else {
        // In-frame scroll: when the
        // wheel is over a screen whose content overflows its frame, the frame
        // consumes the vertical delta — the member scrolls the SCREEN, not the
        // canvas. Canvas panning resumes once the screen hits an edge.
        const scroller = (e.target as HTMLElement | null)?.closest?.(".fd-screen-scroll") as HTMLElement | null;
        if (scroller && scroller.scrollHeight > scroller.clientHeight + 1 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
          const atTop = scroller.scrollTop <= 0 && e.deltaY < 0;
          const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && e.deltaY > 0;
          if (!atTop && !atBottom) {
            scroller.scrollTop += e.deltaY;
            return;
          }
        }
        setCam({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Space key pan mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input,textarea,[contenteditable]")) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const isPanTrigger = spaceDown || e.button === 1 || (e.target === e.currentTarget || (e.target as HTMLElement).dataset.fdCanvasBg !== undefined);
    if (!isPanTrigger) return;
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.fdCanvasBg !== undefined) {
      if (!spaceDown && e.button === 0) onBackgroundClick?.();
    }
    panRef.current = { startX: e.clientX, startY: e.clientY, camX: camRef.current.x, camY: camRef.current.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    const p = panRef.current;
    setCam({ ...camRef.current, x: p.camX + (e.clientX - p.startX), y: p.camY + (e.clientY - p.startY) });
  };
  const onPointerUp = () => { panRef.current = null; };

  // touch pinch
  const touchRef = useRef<{ d: number; z: number; cx: number; cy: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      touchRef.current = {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        z: camRef.current.z,
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
      };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const c = camRef.current;
      const t = touchRef.current;
      const nz = clampZ(t.z * (d / t.d));
      const rect = wrapRef.current!.getBoundingClientRect();
      const px = t.cx - rect.left;
      const py = t.cy - rect.top;
      const wx = (px - c.x) / c.z;
      const wy = (py - c.y) / c.z;
      setCam({ x: px - wx * nz, y: py - wy * nz, z: nz });
    }
  };

  const visible = useCallback((x: number, y: number, w: number, h: number) => {
    const el = wrapRef.current;
    if (!el) return true;
    const c = camRef.current;
    const vx = -c.x / c.z, vy = -c.y / c.z, vw = el.clientWidth / c.z, vh = el.clientHeight / c.z;
    const margin = 600;
    return x + w > vx - margin && x < vx + vw + margin && y + h > vy - margin && y < vy + vh + margin;
  }, [cam]);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      data-fd-canvas-bg
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        background: "#E9E7E2",
        backgroundImage: "radial-gradient(circle, rgba(17,17,17,0.075) 1px, transparent 1px)",
        backgroundSize: `${Math.max(12, 28 * cam.z)}px ${Math.max(12, 28 * cam.z)}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`,
        cursor: spaceDown ? "grab" : "default",
        touchAction: "none",
      }}
    >
      <div
        data-fd-canvas-bg
        style={{
          position: "absolute",
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
          transformOrigin: "0 0",
          width: contentWidth,
          height: contentHeight,
          willChange: "transform",
        }}
      >
        {children(visible, cam.z)}
      </div>
    </div>
  );
}
