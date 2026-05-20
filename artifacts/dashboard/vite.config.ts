import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteCompression from "vite-plugin-compression";
import path from "path";

const port = Number(process.env.PORT ?? 3000);
const basePath = process.env.BASE_PATH ?? "/";
const isReplit = process.env.REPL_ID !== undefined;
const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    // Pre-compress assets for production (gzip + brotli).
    // The production server reads .gz / .br files and sets Content-Encoding.
    ...(!isDev
      ? [
          viteCompression({ algorithm: "gzip",   ext: ".gz",  deleteOriginFile: false }),
          viteCompression({ algorithm: "brotliCompress", ext: ".br", deleteOriginFile: false }),
        ]
      : []),
    ...(isDev && isReplit
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: "es2020",
    minify: "esbuild",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // recharts + d3: heavy, only used on analytics/dashboard charts
          if (id.includes("recharts") || id.includes("/d3") || id.includes("d3-"))
            return "vendor-charts";
          // i18next: needed early but stable — own chunk
          if (id.includes("i18next"))
            return "vendor-i18n";
          // lucide icons: large icon set, changes infrequently
          if (id.includes("lucide"))
            return "vendor-icons";
          // date-fns: only used in a few pages
          if (id.includes("date-fns"))
            return "vendor-dates";
          // Everything else (React, Radix, tanstack, router, forms…) in one
          // stable vendor chunk to prevent circular ESM dependency issues.
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      "/v1": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
