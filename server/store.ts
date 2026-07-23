/**
 * Local JSON-file persistence for the canvas document.
 *
 * The whole document — element overrides, inserted elements, the change log,
 * and saved sessions — lives in `.canvas/state.json` at the project root.
 * It is gitignored by default; commit it if you want reviews in version control.
 */
import { promises as fs } from "fs";
import path from "path";

export interface CanvasDoc {
  overrides: Record<string, unknown>;
  inserted: Record<string, unknown>;
  changeLog: unknown[];
  sessions: unknown[];
}

export const EMPTY_DOC: CanvasDoc = { overrides: {}, inserted: {}, changeLog: [], sessions: [] };

const STATE_DIR = path.resolve(process.cwd(), ".canvas");
const STATE_FILE = path.join(STATE_DIR, "state.json");

export async function getCanvasDoc(): Promise<CanvasDoc> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const doc = JSON.parse(raw) as Partial<CanvasDoc>;
    return {
      overrides: doc.overrides ?? {},
      inserted: doc.inserted ?? {},
      changeLog: doc.changeLog ?? [],
      sessions: doc.sessions ?? [],
    };
  } catch {
    return EMPTY_DOC;
  }
}

export async function saveCanvasDoc(doc: CanvasDoc): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
  await fs.rename(tmp, STATE_FILE);
}
