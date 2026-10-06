import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Build langsung ke folder yang disajikan server (server/public).
  // Sebelumnya hasil build disimpan di client/dist lalu harus disalin manual ke
  // server/public. Kalau salinnya terlupa, server tetap menyajikan bundle LAMA
  // yang belum punya penyimpanan file permanen, sehingga file hasil import
  // terlihat "hilang" setelah refresh. Sekarang build = satu-satunya versi
  // yang dijalankan, jadi tidak mungkin tertinggal.
  build: {
    outDir: "../server/public",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
