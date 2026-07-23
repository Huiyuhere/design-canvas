/**
 * Surface mounts — binds each surface id from the inventory to a live render
 * of the REAL component, pinned to the exact screen-state.
 *
 * Strategy per surface type:
 * - Route screens mount the page directly (memory router context).
 * - Screen-states use the page's own dev affordances (query params) or a
 *   state-pinning wrapper.
 * - Overlays/toasts mount the parent screen with the overlay forced open.
 *
 * When you onboard your own app: replace the imports and the MOUNTS map.
 * Every surface id in shared/surface-inventory.json needs exactly one entry
 * here (scripts/audit-coverage.ts enforces this).
 */
import { lazy, Suspense, useMemo, type ReactNode } from "react";
import { Router } from "wouter";
import memoryLocation from "./memoryLocation";
import { FrameSearchContext } from "./frameEnv";

// Demo app screens (client/src/surfaces/) — replace with your own
const Landing = lazy(() => import("../surfaces/Landing"));
const Auth = lazy(() => import("../surfaces/Auth"));
const Onboarding = lazy(() => import("../surfaces/Onboarding"));
const Home = lazy(() => import("../surfaces/Home"));
const CircleDetail = lazy(() => import("../surfaces/CircleDetail"));
const Settings = lazy(() => import("../surfaces/Settings"));
const AppNotFound = lazy(() => import("../surfaces/AppNotFound"));

function Fallback() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F4", fontFamily: "'Nunito', sans-serif", fontSize: 12, color: "rgba(17,17,17,0.45)" }}>
      loading…
    </div>
  );
}

/** Mount a page inside an isolated memory router at a given path. */
function RouteMount({ path, children }: { path: string; children: ReactNode }) {
  const loc = useMemo(() => memoryLocation(path), [path]);
  const search = path.split("?")[1] ?? "";
  return (
    <FrameSearchContext.Provider value={search}>
      <Router hook={loc.hook} searchHook={loc.searchHook}>
        <Suspense fallback={<Fallback />}>{children}</Suspense>
      </Router>
    </FrameSearchContext.Provider>
  );
}

export interface MountSpec {
  render: () => ReactNode;
  /** window seeds applied before mount (e.g. localStorage state pinning) */
  seed?: () => void;
}

export const MOUNTS: Record<string, MountSpec> = {
  landing: { render: () => <RouteMount path="/"><Landing /></RouteMount> },
  auth: { render: () => <RouteMount path="/auth?mode=signup"><Auth /></RouteMount> },
  "auth-signin": { render: () => <RouteMount path="/auth?mode=signin"><Auth /></RouteMount> },
  "onboarding-name": { render: () => <RouteMount path="/onboarding?step=name"><Onboarding /></RouteMount> },
  "onboarding-frequency": { render: () => <RouteMount path="/onboarding?step=frequency"><Onboarding /></RouteMount> },
  "onboarding-quiet": { render: () => <RouteMount path="/onboarding?step=quiet"><Onboarding /></RouteMount> },
  home: { render: () => <RouteMount path="/home"><Home /></RouteMount> },
  "home-empty": { render: () => <RouteMount path="/home?state=empty"><Home /></RouteMount> },
  "circle-detail": { render: () => <RouteMount path="/circle/inner"><CircleDetail /></RouteMount> },
  "compose-overlay": { render: () => <RouteMount path="/home?overlay=compose"><Home /></RouteMount> },
  "toast-signal-sent": { render: () => <RouteMount path="/home?toast=sent"><Home /></RouteMount> },
  settings: { render: () => <RouteMount path="/settings"><Settings /></RouteMount> },
  "settings-delete": { render: () => <RouteMount path="/settings?overlay=delete"><Settings /></RouteMount> },
  "not-found": { render: () => <RouteMount path="/404"><AppNotFound /></RouteMount> },
};

export function getMount(surfaceId: string): MountSpec | undefined {
  return MOUNTS[surfaceId];
}
