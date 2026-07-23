import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // Stamps data-loc="<file>:<line>:<col>" on every JSX element so the canvas
    // can anchor visual edits to exact source locations. This is the heart of
    // the code-native workflow — do not remove.
    jsxLocPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist", "public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    fs: { strict: true, deny: ["**/.*"] },
  },
});
