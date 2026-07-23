import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
      "@shared": path.resolve(root, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
  },
});
