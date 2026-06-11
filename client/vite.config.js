import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "node:path";
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  css: {
    preprocessorOptions: {
      scss: {
        // Silence deprecations from our @import and from react-big-calendar (node_modules)
        silenceDeprecations: ["import", "global-builtin", "color-functions"],
      },
    },
  },
  resolve: {
    alias: {
      "@assets": path.resolve(__dirname, "./src/assets"),
    },
  },
  server: {
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
