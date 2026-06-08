import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'node:path'

// The TanStack Router plugin MUST run before @vitejs/plugin-react. The dev
// server proxies /api and /healthz to a locally-running arby binary;
// http-proxy streams SSE responses un-buffered by default, so the two live-tail
// EventSource streams work through the proxy. emptyOutDir:false keeps the
// committed web/dist/.gitkeep so bare `go build ./...` (no npm) still compiles
// the //go:embed all:dist directive.
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', emptyOutDir: false },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})
