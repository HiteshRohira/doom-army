import { defineConfig } from "vite";

export default defineConfig({
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
