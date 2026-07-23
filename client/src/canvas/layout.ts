/**
 * Canvas layout — computes fixed positions for every surface in a workspace,
 * arranged in labeled flow rows (like a Figma page).
 *
 * Rows come from each surface's optional `section` field in the inventory;
 * surfaces without a section share one row named after the workspace.
 */
import { SURFACES, WORKSPACES, type SurfaceDef, type WorkspaceId } from "./registry";
import { FRAME_W, FRAME_H } from "./DeviceFrame";

export interface PlacedSurface {
  surface: SurfaceDef;
  x: number;
  y: number;
  row: string;
}

const GAP_X = 90;
const GAP_Y = 170;
const ROW_LABEL_H = 60;
const PER_ROW = 8;

/** Row grouping: inventory `section` first, workspace name as fallback. */
function rowKey(s: SurfaceDef): string {
  if (s.section) return String(s.section);
  return WORKSPACES.find((w) => w.id === s.workspace)?.name ?? s.workspace;
}

export function layoutWorkspace(ws: WorkspaceId): { placed: PlacedSurface[]; rows: { label: string; y: number }[]; width: number; height: number } {
  const surfaces = SURFACES.filter((s) => s.workspace === ws);
  const rowOrder: string[] = [];
  const byRow = new Map<string, SurfaceDef[]>();
  surfaces.forEach((s) => {
    const r = rowKey(s);
    if (!byRow.has(r)) { byRow.set(r, []); rowOrder.push(r); }
    byRow.get(r)!.push(s);
  });

  const placed: PlacedSurface[] = [];
  const rows: { label: string; y: number }[] = [];
  let y = 80;
  let maxWidth = 0;
  rowOrder.forEach((label) => {
    const list = byRow.get(label)!;
    rows.push({ label, y });
    const lines = Math.ceil(list.length / PER_ROW);
    list.forEach((s, i) => {
      const col = i % PER_ROW;
      const line = Math.floor(i / PER_ROW);
      const x = 80 + col * (FRAME_W + 24 + GAP_X);
      placed.push({ surface: s, x, y: y + ROW_LABEL_H + line * (FRAME_H + 24 + GAP_Y), row: label });
      maxWidth = Math.max(maxWidth, x + FRAME_W + 24 + 80);
    });
    y += ROW_LABEL_H + lines * (FRAME_H + 24 + GAP_Y) + 60;
  });
  return { placed, rows, width: maxWidth, height: y + 100 };
}

export function findPlacement(placed: PlacedSurface[], surfaceId: string): PlacedSurface | undefined {
  return placed.find((p) => p.surface.id === surfaceId);
}

