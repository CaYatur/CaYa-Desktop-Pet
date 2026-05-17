import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri dev server için sabit port ve HMR ayarları.
// Tauri arka tarafında Rust bu adresi bekliyor (tauri.conf.json -> build.devUrl).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost"
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: false
  }
});
