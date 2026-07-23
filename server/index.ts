/**
 * Design Canvas server — a tiny Express + tRPC server whose only jobs are:
 * 1. serving the Vite-built client (production) or proxying Vite (dev)
 * 2. persisting the canvas document to a local JSON file (.canvas/state.json)
 *
 * No database, no auth, no external APIs. Delete `.canvas/` to reset state.
 */
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = express();
  const server = createServer(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: () => ({}),
    }),
  );

  if (process.env.NODE_ENV === "production") {
    const publicDir = path.resolve(__dirname, "public");
    app.use(express.static(publicDir));
    app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  } else {
    // Dev: mount Vite in middleware mode so one port serves everything.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, "..", "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const port = parseInt(process.env.PORT ?? "3000", 10);
  server.listen(port, () => {
    console.log(`Design Canvas running on http://localhost:${port}/`);
  });
}

main();
