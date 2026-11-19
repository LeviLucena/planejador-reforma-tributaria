import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Desenvolvimento: o servidor só aceita a origem do Vite (porta 5173) se for iniciado com
  // MODO_DEV=1; changeOrigin faz o Host chegar como 127.0.0.1:3000 (checado pela proteção local).
  server: { proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: true } } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTestes.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
