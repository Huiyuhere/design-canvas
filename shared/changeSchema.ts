/**
 * Change-log + session schemas — the export contract consumed by coding
 * agents. Field names are stable API: renaming them breaks downstream
 * agent prompts and the docs/export-format.md spec.
 */
import { z } from "zod";

export const OPS = ["edit", "add", "delete", "move", "resize", "hide", "show", "duplicate", "annotate"] as const;
export type Op = (typeof OPS)[number];

export const changeEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1), // ISO-8601 UTC
  op: z.enum(OPS),
  workspace: z.string().min(1),
  surface: z.string().min(1),
  surfaceType: z.string().min(1),
  elementId: z.string().min(1),
  elementRole: z.string(),
  sourceFile: z.string().min(1),
  line: z.number().int().nonnegative(),
  componentName: z.string(),
  property: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  insertedSpec: z.unknown().nullable(),
  anchorElement: z.string().nullable(),
  position: z.unknown().nullable(),
  deletedSnapshot: z.unknown().nullable(),
  offPalette: z.boolean(),
  notes: z.string(),
});

export type ChangeEntry = z.infer<typeof changeEntrySchema>;

export const sessionEntrySchema = z.object({
  sessionId: z.string().min(1),
  savedAt: z.string().min(1), // ISO-8601 UTC
  label: z.string(),
  changeCount: z.number().int().nonnegative(),
  opsByType: z.record(z.string(), z.number().int().nonnegative()),
  surfacesTouched: z.array(z.string()),
  changeIds: z.array(z.string()),
});

export type SessionEntry = z.infer<typeof sessionEntrySchema>;
