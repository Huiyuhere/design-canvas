/**
 * Undo/redo fidelity — a real bug report:
 * "i have clicked on undo but its formatting is lost" + request for
 * Ctrl+Z (undo) / Ctrl+Y (redo) / Ctrl+S (explicit save).
 *
 * Store-level guarantees tested here:
 *  1. undo of a rich-text edit restores the exact previous value (markup intact)
 *  2. redo re-applies the exact after value (markup intact)
 *  3. redo stack is cleared by any new change (no branched history corruption)
 *  4. undo/redo round-trips style props (color, fontFamily) with fidelity
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CanvasStore } from "../client/src/canvas/store";

const SURFACE = "landing";
const EL = "client/src/surfaces/Landing.tsx@133";

function makeStore() {
  const store = new CanvasStore();
  store.hydrate({ overrides: {}, inserted: {}, changeLog: [], sessions: [] } as never);
  return store;
}

describe("undo/redo fidelity", () => {
  let store: CanvasStore;
  beforeEach(() => { store = makeStore(); });

  it("undo of a rich-text edit restores the previous rich value exactly", () => {
    const original = "One <em>quiet</em> signal.";
    const edited = "One <strong>quiet</strong> signal.";
    store.applyOverride(SURFACE, EL, "edit", "text", original, edited, { text: edited });
    expect(store.getState().overrides[`${SURFACE}::${EL}`]?.text).toBe(edited);

    store.undoLast();
    const o = store.getState().overrides[`${SURFACE}::${EL}`];
    // either the property is dropped entirely (no prior edit → original restored
    // from source) or it holds the exact original rich value — both preserve markup
    if (o?.text !== undefined) expect(o.text).toBe(original);
    expect(store.getState().changeLog.length).toBe(0);
  });

  it("redo re-applies the exact after value including markup", () => {
    const before = "We find your person.";
    const after = "We find your <strong>person</strong>.<br>You both get a day.";
    store.applyOverride(SURFACE, EL, "edit", "text", before, after, { text: after });
    store.undoLast();
    expect(store.getState().changeLog.length).toBe(0);
    expect(store.canRedo()).toBe(true);

    store.redoLast();
    expect(store.getState().overrides[`${SURFACE}::${EL}`]?.text).toBe(after);
    expect(store.getState().changeLog.length).toBe(1);
    expect(store.getState().changeLog[0].after).toBe(after);
  });

  it("a new change clears the redo stack", () => {
    store.applyOverride(SURFACE, EL, "edit", "text", "a", "b", { text: "b" });
    store.undoLast();
    expect(store.canRedo()).toBe(true);
    store.applyOverride(SURFACE, EL, "edit", "color", "#111111", "#14655A", { color: "#14655A" });
    expect(store.canRedo()).toBe(false);
    store.redoLast(); // no-op
    expect(store.getState().changeLog.length).toBe(1);
  });

  it("undo/redo round-trips style props with fidelity", () => {
    store.applyOverride(SURFACE, EL, "edit", "fontFamily", "'Nunito', sans-serif", "'Times New Roman', serif", { fontFamily: "'Times New Roman', serif" });
    store.applyOverride(SURFACE, EL, "edit", "color", "#111111", "#14655A", { color: "#14655A" });
    store.undoLast(); // undo color
    store.undoLast(); // undo fontFamily
    const afterUndo = store.getState().overrides[`${SURFACE}::${EL}`];
    expect(afterUndo?.color === undefined || afterUndo.color === "#111111").toBe(true);

    store.redoLast(); // redo fontFamily
    store.redoLast(); // redo color
    const o = store.getState().overrides[`${SURFACE}::${EL}`];
    expect(o?.fontFamily).toBe("'Times New Roman', serif");
    expect(o?.color).toBe("#14655A");
    expect(store.getState().changeLog.length).toBe(2);
  });

  it("redo restores a move with exact offsets", () => {
    store.applyOverride(SURFACE, EL, "move", "position", { dx: 0, dy: 0 }, { dx: 4, dy: -2 }, { dx: 4, dy: -2 });
    store.undoLast();
    store.redoLast();
    const o = store.getState().overrides[`${SURFACE}::${EL}`];
    expect(o?.dx).toBe(4);
    expect(o?.dy).toBe(-2);
  });
});
