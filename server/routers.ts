import { z } from "zod";
import { changeEntrySchema, sessionEntrySchema } from "../shared/changeSchema";
import { getCanvasDoc, saveCanvasDoc } from "./store";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  canvas: router({
    /** Load the shared canvas document (overrides, inserted, change log, sessions). */
    get: publicProcedure.query(async () => getCanvasDoc()),
    /** Persist the canvas document; change/session entries are schema-validated. */
    save: publicProcedure
      .input(
        z.object({
          overrides: z.record(z.string(), z.unknown()),
          inserted: z.record(z.string(), z.unknown()),
          changeLog: z.array(changeEntrySchema),
          sessions: z.array(sessionEntrySchema),
        }),
      )
      .mutation(async ({ input }) => {
        await saveCanvasDoc(input);
        return { success: true, savedAt: new Date().toISOString() } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
