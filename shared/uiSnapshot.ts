/**
 * UI snapshot — the platform-neutral ground truth for iOS conversion.
 *
 * A snapshot is captured from the live DOM of a rendered surface (with all
 * canvas overrides applied) and records, for every visible element, the
 * browser's COMPUTED styles and layout box — not the source styles. This is
 * what "exactly the same as the simulation" means: fonts, colors, sizes,
 * placement, and images as actually rendered, in device-frame coordinates.
 *
 * The SwiftUI converter consumes snapshots to generate .swift views, and the
 * parity audit re-reads the generated Swift to verify every recorded value
 * survives translation. Both live in scripts/; this schema is the contract.
 */
import { z } from "zod";

/** Layout box in device-frame coordinates (CSS px, origin = frame top-left). */
export const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const textStyleSchema = z.object({
  /** Resolved first family, e.g. "Georgia" or "Nunito". */
  fontFamily: z.string(),
  fontSizePx: z.number(),
  fontWeight: z.number(),
  fontStyle: z.enum(["normal", "italic"]),
  /** Normalized #RRGGBB or rgba(r,g,b,a). */
  color: z.string(),
  letterSpacingPx: z.number().nullable(),
  lineHeightPx: z.number().nullable(),
  textAlign: z.enum(["left", "center", "right", "justify"]),
  textDecoration: z.enum(["none", "underline", "line-through"]),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]),
});

export const snapshotNodeSchema: z.ZodType<SnapshotNode> = z.lazy(() =>
  z.object({
    /** Stable element anchor when instrumented: "<file>@<line>#<n>". */
    elementId: z.string().nullable(),
    /** Semantic kind derived from the tag: text | button | input | image | container. */
    kind: z.enum(["text", "button", "input", "image", "container"]),
    tag: z.string(),
    /** Direct text content (own text nodes only, trimmed), null for non-text. */
    text: z.string().nullable(),
    box: boxSchema,
    /** Normalized background color, null when fully transparent. */
    background: z.string().nullable(),
    /** CSS background-image / <img src> URL, null when none. */
    imageSrc: z.string().nullable(),
    /** How the image fills its box. */
    imageMode: z.enum(["cover", "contain", "fill"]).nullable(),
    borderRadiusPx: z.number(),
    border: z
      .object({ widthPx: z.number(), color: z.string() })
      .nullable(),
    opacity: z.number(),
    zIndex: z.number(),
    textStyle: textStyleSchema.nullable(),
    children: z.array(snapshotNodeSchema),
  }),
);

export interface SnapshotNode {
  elementId: string | null;
  kind: "text" | "button" | "input" | "image" | "container";
  tag: string;
  text: string | null;
  box: { x: number; y: number; w: number; h: number };
  background: string | null;
  imageSrc: string | null;
  imageMode: "cover" | "contain" | "fill" | null;
  borderRadiusPx: number;
  border: { widthPx: number; color: string } | null;
  opacity: number;
  zIndex: number;
  textStyle: z.infer<typeof textStyleSchema> | null;
  children: SnapshotNode[];
}

export const surfaceSnapshotSchema = z.object({
  surfaceId: z.string(),
  surfaceName: z.string(),
  capturedAt: z.string(),
  device: z.object({ width: z.number(), height: z.number() }),
  root: snapshotNodeSchema,
});

export type SurfaceSnapshot = z.infer<typeof surfaceSnapshotSchema>;

export type TextStyle = z.infer<typeof textStyleSchema>;

/** Normalize any CSS color the browser reports to #RRGGBB or rgba(). */
export function normalizeColor(css: string): string | null {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return css === "transparent" ? null : css;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a === 0) return null;
  if (a === 1) {
    const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${r},${g},${b},${a})`;
}
