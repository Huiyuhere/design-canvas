/**
 * Canvas store — zustand-free (plain React context + useSyncExternalStore)
 * Holds: viewport (pan/zoom), selection, per-surface element overrides,
 * change log (add/edit/delete/move/resize/hide), session log.
 *
 * Overrides are applied as DOM patches on top of the REAL rendered screen
 * code; every mutation emits a precise ChangeEntry with source anchors.
 */
import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { ChangeEntry, Op, SessionEntry } from "../../../shared/changeSchema";
import { isOffPalette, lintCopy } from "../../../shared/tokens";
import { getSurface } from "./registry";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ElementOverride {
  elementId: string; // stable data-fd-id
  surfaceId: string;
  text?: string;
  color?: string;
  background?: string;
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  letterSpacing?: string;
  lineHeight?: string;
  textTransform?: string;
  textAlign?: string;
  borderColor?: string;
  dx?: number;
  dy?: number;
  w?: number;
  h?: number;
  hidden?: boolean;
  annotation?: string;
}

export interface InsertedElement {
  elementId: string;
  surfaceId: string;
  anchorElement: string;
  kind: "text" | "button" | "note";
  text: string;
  color: string;
  background: string;
  fontSize: string;
  dx: number;
  dy: number;
}

export interface CanvasState {
  overrides: Record<string, ElementOverride>; // key: `${surfaceId}::${elementId}`
  inserted: Record<string, InsertedElement>;
  changeLog: ChangeEntry[];
  sessions: SessionEntry[];
  selection: { surfaceId: string; elementId: string } | null;
  selectedSurface: string | null;
  showFlows: boolean;
  playMode: boolean;
  darkMode: boolean;
  dynamicType: boolean;
  beforeAfter: Record<string, boolean>; // surfaceId -> showing "before"
  dirty: boolean;
}

const initialState: CanvasState = {
  overrides: {},
  inserted: {},
  changeLog: [],
  sessions: [],
  selection: null,
  selectedSurface: null,
  showFlows: false,
  playMode: false,
  darkMode: false,
  dynamicType: false,
  beforeAfter: {},
  dirty: false,
};

// ─── Store implementation ─────────────────────────────────────────────────────
type Listener = () => void;

export class CanvasStore {
  private state: CanvasState = initialState;
  private listeners = new Set<Listener>();
  private changeSeq = 0;
  /** Redo stack: entries popped by undo, replayable with redoLast(). Cleared on any new change. */
  private redoStack: ChangeEntry[] = [];

  getState = () => this.state;
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(partial: Partial<CanvasState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l());
  }

  hydrate(data: { overrides?: Record<string, ElementOverride>; inserted?: Record<string, InsertedElement>; changeLog?: ChangeEntry[]; sessions?: SessionEntry[] }) {
    this.set({
      overrides: data.overrides ?? {},
      inserted: data.inserted ?? {},
      changeLog: data.changeLog ?? [],
      sessions: data.sessions ?? [],
      dirty: false,
    });
    this.changeSeq = (data.changeLog?.length ?? 0) + 1;
  }

  select(surfaceId: string | null, elementId?: string) {
    this.set({
      selectedSurface: surfaceId,
      selection: surfaceId && elementId ? { surfaceId, elementId } : null,
    });
  }

  toggleFlows() { this.set({ showFlows: !this.state.showFlows }); }
  setPlayMode(v: boolean) { this.set({ playMode: v }); }
  toggleDark() { this.set({ darkMode: !this.state.darkMode }); }
  toggleDynamicType() { this.set({ dynamicType: !this.state.dynamicType }); }
  toggleBeforeAfter(surfaceId: string) {
    this.set({ beforeAfter: { ...this.state.beforeAfter, [surfaceId]: !this.state.beforeAfter[surfaceId] } });
  }

  /** Record a change entry with exact schema field names. */
  private log(entry: Omit<ChangeEntry, "id" | "timestamp">) {
    const full: ChangeEntry = {
      id: `chg-${String(++this.changeSeq).padStart(4, "0")}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.redoStack = []; // a fresh change invalidates the redo branch
    this.set({ changeLog: [...this.state.changeLog, full], dirty: true });
    return full;
  }

  private anchor(surfaceId: string, elementId: string) {
    const s = getSurface(surfaceId);
    // elementId encodes source anchor: <file>@<line>#<n> produced by the jsx-loc plugin
    const m = /^(.*)@(\d+)/.exec(elementId);
    return {
      workspace: s?.workspace ?? "unknown",
      surface: surfaceId,
      surfaceType: s?.type ?? "screen",
      sourceFile: m ? m[1] : (s?.sourceFile ?? "unknown"),
      line: m ? parseInt(m[2], 10) : 0,
    };
  }

  private key(surfaceId: string, elementId: string) { return `${surfaceId}::${elementId}`; }

  /** Shared elements (source anchor outside surfaces/) can be edited once and
   *  applied to every frame rendering that anchor via the `*::` key. */
  static sharedKey(elementId: string) { return `*::${elementId}`; }
  /** True when this element's source anchor lives in a shared component file. */
  static isSharedAnchor(elementId: string) {
    return /^client\/src\/components\//.test(elementId);
  }

  applyOverride(
    surfaceId: string,
    elementId: string,
    op: Op,
    property: string,
    before: unknown,
    after: unknown,
    patch: Partial<ElementOverride>,
    meta?: { elementRole?: string; componentName?: string; notes?: string; shared?: boolean; sharedSurfaces?: string[] },
  ) {
    const k = meta?.shared ? CanvasStore.sharedKey(elementId) : this.key(surfaceId, elementId);
    const existing = this.state.overrides[k] ?? { elementId, surfaceId };
    const next: ElementOverride = { ...existing, ...patch };
    let offPalette =
      (property === "color" || property === "background") && typeof after === "string"
        ? isOffPalette(after)
        : false;
    let notes = meta?.notes ?? "";
    if (property === "text" && typeof after === "string") {
      const lint = lintCopy(after);
      if (lint.length) {
        const lintNote = `COPY LINT: ${lint.map((l) => `"${l.term}" — ${l.reason}`).join("; ")}`;
        notes = notes ? `${notes}; ${lintNote}` : lintNote;
      }
      // span-level colours travel inside text markup (data-c) — flag off-palette hexes
      const spanHexes = Array.from(after.matchAll(/data-c="(#[0-9A-F]{6})"/g), (m) => m[1]);
      if (spanHexes.some((h) => isOffPalette(h))) offPalette = true;
    }
    if (meta?.shared) {
      const list = meta.sharedSurfaces ?? [];
      const sharedNote = `SHARED COMPONENT — one edit applies to ${list.length || "all"} screens${list.length ? ` (${list.join(", ")})` : ""}`;
      notes = notes ? `${sharedNote}; ${notes}` : sharedNote;
    }
    this.set({ overrides: { ...this.state.overrides, [k]: next } });
    return this.log({
      op,
      ...this.anchor(surfaceId, elementId),
      elementId,
      elementRole: meta?.elementRole ?? "",
      componentName: meta?.componentName ?? "",
      property,
      before,
      after,
      insertedSpec: null,
      anchorElement: null,
      position: null,
      deletedSnapshot: null,
      offPalette,
      notes,
    });
  }

  insertElement(spec: InsertedElement, meta?: { notes?: string }) {
    this.set({ inserted: { ...this.state.inserted, [this.key(spec.surfaceId, spec.elementId)]: spec } });
    return this.log({
      op: "add",
      ...this.anchor(spec.surfaceId, spec.anchorElement),
      elementId: spec.elementId,
      elementRole: spec.kind,
      componentName: "",
      property: "",
      before: null,
      after: null,
      insertedSpec: spec,
      anchorElement: spec.anchorElement,
      position: { dx: spec.dx, dy: spec.dy },
      deletedSnapshot: null,
      offPalette: isOffPalette(spec.color) || isOffPalette(spec.background),
      notes: meta?.notes ?? "",
    });
  }

  deleteElement(surfaceId: string, elementId: string, snapshot: Record<string, unknown>, meta?: { elementRole?: string; componentName?: string }) {
    const k = this.key(surfaceId, elementId);
    if (this.state.inserted[k]) {
      const { [k]: _, ...rest } = this.state.inserted;
      this.set({ inserted: rest });
    } else {
      const existing = this.state.overrides[k] ?? { elementId, surfaceId };
      this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, hidden: true } } });
    }
    return this.log({
      op: "delete",
      ...this.anchor(surfaceId, elementId),
      elementId,
      elementRole: meta?.elementRole ?? "",
      componentName: meta?.componentName ?? "",
      property: "",
      before: null,
      after: null,
      insertedSpec: null,
      anchorElement: null,
      position: null,
      deletedSnapshot: snapshot,
      offPalette: false,
      notes: "",
    });
  }

  saveSession(label: string): SessionEntry {
    const lastSaved = this.state.sessions.at(-1);
    const sinceIdx = lastSaved
      ? this.state.changeLog.findIndex((c) => c.id === lastSaved.changeIds.at(-1)) + 1
      : 0;
    const changes = this.state.changeLog.slice(sinceIdx);
    const opsByType: Record<string, number> = {};
    changes.forEach((c) => { opsByType[c.op] = (opsByType[c.op] ?? 0) + 1; });
    const entry: SessionEntry = {
      sessionId: `sess-${String(this.state.sessions.length + 1).padStart(3, "0")}`,
      savedAt: new Date().toISOString(),
      label,
      changeCount: changes.length,
      opsByType,
      surfacesTouched: Array.from(new Set(changes.map((c) => c.surface))),
      changeIds: changes.map((c) => c.id),
    };
    this.set({ sessions: [...this.state.sessions, entry], dirty: false });
    return entry;
  }

  undoLast() {
    const log = this.state.changeLog;
    if (!log.length) return;
    const last = log[log.length - 1];
    this.redoStack.push(last);
    const sk = CanvasStore.sharedKey(last.elementId);
    const wasShared = typeof last.notes === "string" && last.notes.startsWith("SHARED COMPONENT") && !!this.state.overrides[sk];
    const k = wasShared ? sk : this.key(last.surface, last.elementId);
    if (last.op === "add") {
      const { [k]: _, ...rest } = this.state.inserted;
      this.set({ inserted: rest });
    } else if (last.op === "delete") {
      const existing = this.state.overrides[k];
      if (existing) this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, hidden: false } } });
    } else if (last.property && last.op === "edit") {
      const existing = this.state.overrides[k];
      if (existing) {
        const map: Record<string, keyof ElementOverride> = {
          text: "text", color: "color", background: "background",
          fontSize: "fontSize", fontWeight: "fontWeight", fontFamily: "fontFamily",
          letterSpacing: "letterSpacing", lineHeight: "lineHeight", textTransform: "textTransform",
          textAlign: "textAlign", borderColor: "borderColor",
        };
        const prop = map[last.property];
        if (prop) {
          // if no earlier entry edited the same property on this element,
          // restoring "before" means the value is back to the original —
          // drop the property (and the override if nothing else remains)
          const hasEarlier = log.slice(0, -1).some(
            (c) => c.op === "edit" && c.property === last.property &&
              (wasShared
                ? c.elementId === last.elementId && typeof c.notes === "string" && c.notes.startsWith("SHARED COMPONENT")
                : this.key(c.surface, c.elementId) === k),
          );
          const next = { ...existing } as ElementOverride & Record<string, unknown>;
          if (hasEarlier) next[prop] = last.before as never;
          else delete next[prop];
          const meaningful = (["text", "color", "background", "fontSize", "fontWeight", "fontFamily", "letterSpacing", "lineHeight", "textTransform", "textAlign", "borderColor", "w", "h", "annotation"] as const)
            .some((p) => next[p] !== undefined) || next.hidden === true || !!next.dx || !!next.dy;
          if (meaningful) {
            this.set({ overrides: { ...this.state.overrides, [k]: next } });
          } else {
            const { [k]: _drop, ...rest } = this.state.overrides;
            this.set({ overrides: rest });
          }
        }
      }
    } else if (last.op === "move") {
      const existing = this.state.overrides[k];
      const b = last.before as { dx?: number; dy?: number } | null;
      if (existing) this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, dx: b?.dx ?? 0, dy: b?.dy ?? 0 } } });
    } else if (last.op === "resize") {
      const existing = this.state.overrides[k];
      const b = last.before as { w?: number; h?: number } | null;
      if (existing) this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, w: b?.w, h: b?.h } } });
    }
    this.set({ changeLog: log.slice(0, -1), dirty: true });
  }

  /** True when redoLast() has something to replay. */
  canRedo() { return this.redoStack.length > 0; }

  /** Re-apply the most recently undone change, restoring its exact after
   *  value (rich text markup, fonts, colours — full fidelity). */
  redoLast() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    const wasShared = typeof entry.notes === "string" && entry.notes.startsWith("SHARED COMPONENT");
    const k = wasShared ? CanvasStore.sharedKey(entry.elementId) : this.key(entry.surface, entry.elementId);
    if (entry.op === "add" && entry.insertedSpec) {
      this.set({ inserted: { ...this.state.inserted, [k]: entry.insertedSpec as InsertedElement } });
    } else if (entry.op === "delete") {
      const existing = this.state.overrides[k] ?? { elementId: entry.elementId, surfaceId: entry.surface };
      this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, hidden: true } } });
    } else if (entry.op === "edit" && entry.property) {
      const map: Record<string, keyof ElementOverride> = {
        text: "text", color: "color", background: "background",
        fontSize: "fontSize", fontWeight: "fontWeight", fontFamily: "fontFamily",
        letterSpacing: "letterSpacing", lineHeight: "lineHeight", textTransform: "textTransform",
        textAlign: "textAlign", borderColor: "borderColor",
      };
      const prop = map[entry.property];
      if (prop) {
        const existing = this.state.overrides[k] ?? { elementId: entry.elementId, surfaceId: entry.surface };
        this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, [prop]: entry.after as never } } });
      }
    } else if (entry.op === "move") {
      const a = entry.after as { dx?: number; dy?: number } | null;
      const existing = this.state.overrides[k] ?? { elementId: entry.elementId, surfaceId: entry.surface };
      this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, dx: a?.dx ?? 0, dy: a?.dy ?? 0 } } });
    } else if (entry.op === "resize") {
      const a = entry.after as { w?: number; h?: number } | null;
      const existing = this.state.overrides[k] ?? { elementId: entry.elementId, surfaceId: entry.surface };
      this.set({ overrides: { ...this.state.overrides, [k]: { ...existing, w: a?.w, h: a?.h } } });
    }
    // reinstate the entry at the end of the log (same id, original payload)
    this.set({ changeLog: [...this.state.changeLog, entry], dirty: true });
  }

  resetSurface(surfaceId: string) {
    const overrides = Object.fromEntries(Object.entries(this.state.overrides).filter(([k]) => !k.startsWith(`${surfaceId}::`)));
    const inserted = Object.fromEntries(Object.entries(this.state.inserted).filter(([k]) => !k.startsWith(`${surfaceId}::`)));
    this.set({ overrides, inserted, dirty: true });
  }
}

// ─── React bindings ───────────────────────────────────────────────────────────
const StoreCtx = createContext<CanvasStore | null>(null);

export function CanvasStoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<CanvasStore | null>(null);
  if (!ref.current) ref.current = new CanvasStore();
  return <StoreCtx.Provider value={ref.current}>{children}</StoreCtx.Provider>;
}

export function useCanvasStore(): CanvasStore {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useCanvasStore outside provider");
  return s;
}

export function useCanvasState<T>(selector: (s: CanvasState) => T): T {
  const store = useCanvasStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
