/**
 * FlowArrows — curved SVG arrows from each trigger to its destination surface
 * with hover badges showing "→ NextScreen". Toggleable.
 */
import { useMemo, useState } from "react";
import type { PlacedSurface } from "./layout";
import { FRAME_W, FRAME_H } from "./DeviceFrame";
import { getSurface } from "./registry";

interface Props {
  placed: PlacedSurface[];
  width: number;
  height: number;
}

interface Edge {
  from: PlacedSurface;
  to: PlacedSurface;
  trigger: string;
  key: string;
}

export function FlowArrows({ placed, width, height }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const edges = useMemo<Edge[]>(() => {
    const byId = new Map(placed.map((p) => [p.surface.id, p]));
    const out: Edge[] = [];
    placed.forEach((p) => {
      p.surface.nav.forEach((n, i) => {
        if (n.to.startsWith("toast:")) return;
        const to = byId.get(n.to);
        if (!to) return; // cross-workspace edge — drawn in flow tree instead
        out.push({ from: p, to, trigger: n.trigger, key: `${p.surface.id}-${n.to}-${i}` });
      });
    });
    return out;
  }, [placed]);

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, overflow: "visible" }}>
      <defs>
        <marker id="fd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#14655A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {edges.map((e) => {
        const x1 = e.from.x + FRAME_W + 24;
        const y1 = e.from.y + (FRAME_H + 24) / 2;
        const x2 = e.to.x;
        const y2 = e.to.y + (FRAME_H + 24) / 2;
        const sameRow = Math.abs(y1 - y2) < 10;
        const forward = x2 > x1;
        let d: string;
        if (sameRow && forward) {
          const mx = (x1 + x2) / 2;
          d = `M ${x1} ${y1} C ${mx} ${y1 - 60}, ${mx} ${y2 - 60}, ${x2 - 6} ${y2}`;
        } else if (forward) {
          d = `M ${x1} ${y1} C ${x1 + 140} ${y1}, ${x2 - 140} ${y2}, ${x2 - 6} ${y2}`;
        } else {
          // backward/downward edge — arc below frames
          const yTop = Math.max(y1, y2) + FRAME_H / 2 + 90;
          d = `M ${x1} ${y1} C ${x1 + 120} ${yTop}, ${x2 - 120} ${yTop}, ${x2 - 6} ${y2}`;
        }
        const isHover = hover === e.key;
        const midX = (x1 + x2) / 2;
        const midY = sameRow && forward ? y1 - 48 : (y1 + y2) / 2 - (forward ? 8 : -70);
        return (
          <g key={e.key}>
            <path d={d} fill="none" stroke={isHover ? "#14655A" : "rgba(20,101,90,0.38)"} strokeWidth={isHover ? 2.4 : 1.6} markerEnd="url(#fd-arrow)" strokeDasharray={isHover ? undefined : "6 5"} style={{ transition: "stroke 160ms" }} />
            {/* fat invisible hover target */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={18} style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseEnter={() => setHover(e.key)} onMouseLeave={() => setHover(null)} />
            {isHover && (
              <foreignObject x={midX - 150} y={midY - 24} width={300} height={54} style={{ pointerEvents: "none", overflow: "visible" }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{ background: "#111111", color: "#FFFFFF", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontFamily: "'Nunito', sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxWidth: 290, textAlign: "center" }}>
                    <span style={{ opacity: 0.65 }}>{e.trigger}</span>
                    <span style={{ fontWeight: 700, color: "#F4B8C4" }}> → {getSurface(e.to.surface.id)?.name ?? e.to.surface.id}</span>
                  </div>
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );
}

