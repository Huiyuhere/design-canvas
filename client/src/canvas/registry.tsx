/**
 * Surface registry — single source of truth binding every reviewable surface
 * (screens, screen-states, overlays, toasts) to the real component that
 * renders it, plus workspace, nav edges, and source-code anchors for the
 * change log.
 *
 * Ground truth: shared/surface-inventory.json (validated by scripts/audit-coverage.ts).
 * Workspaces come from canvas.config.ts.
 */
import config from "../../../canvas.config";
import inventoryJson from "../../../shared/surface-inventory.json";

export interface NavEdge {
  trigger: string;
  to: string;
}

/**
 * Where this surface's real source code lives, per platform. Paths are
 * repo-relative; the matching repo names come from canvas.config.ts `repos`.
 * Exports include every mapping so a coding agent knows exactly which file
 * to change on each platform.
 */
export interface CodeRefs {
  web?: string; // e.g. "src/pages/Home.tsx"
  ios?: string; // e.g. "ios/App/UI/HomeView.swift"
  android?: string; // e.g. "app/src/main/java/.../HomeScreen.kt"
}

export interface SurfaceDef {
  id: string;
  workspace: string;
  type: "screen" | "screen-state" | "overlay" | "interstitial" | "toast";
  name: string;
  route: string;
  section?: string;
  conditional?: string;
  parent?: string;
  state?: Record<string, unknown>;
  /** The canvas-local blueprint file that renders this surface. */
  sourceFile: string;
  hostFile?: string;
  /** Per-platform mappings to the real app source. */
  codeRefs?: CodeRefs;
  nav: NavEdge[];
}

export type WorkspaceId = string;

export interface WorkspaceDef {
  id: string;
  name: string;
  description: string;
  cap: number;
}

export const WORKSPACES: WorkspaceDef[] = config.workspaces;

export const SURFACES: SurfaceDef[] = (inventoryJson as { surfaces: SurfaceDef[] }).surfaces;

export function surfacesByWorkspace(ws: WorkspaceId): SurfaceDef[] {
  return SURFACES.filter((s) => s.workspace === ws);
}

export function getSurface(id: string): SurfaceDef | undefined {
  return SURFACES.find((s) => s.id === id);
}

/** All nav edges flattened for the flow map. */
export function allEdges(): { from: string; trigger: string; to: string }[] {
  return SURFACES.flatMap((s) =>
    s.nav
      .filter((e) => !e.to.startsWith("toast:"))
      .map((e) => ({ from: s.id, trigger: e.trigger, to: e.to })),
  );
}
