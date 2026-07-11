import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/phaser")) return "phaser";
          if (id.includes("node_modules/socket.io") || id.includes("node_modules/engine.io")) return "network";
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
