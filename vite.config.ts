import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // The xeokit SDK is only reached through a dynamic import() in Model3DViewer
  // (to code-split it out of the main bundle). Because nothing imports it
  // statically, Vite's dev optimizer doesn't pre-bundle it at startup — it
  // discovers it on the first model open, re-optimizes, and invalidates the
  // dep hash, which makes that in-flight dynamic import 404 ("Failed to fetch
  // dynamically imported module … @xeokit_xeokit-sdk.js?v=…"). Pre-bundling it
  // here gives a stable optimized chunk from the start. Dev-only: the production
  // dynamic import still splits xeokit into its own chunk.
  optimizeDeps: {
    include: ['@xeokit/xeokit-sdk'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    // Bind all interfaces and accept tunnelled hosts (e.g. *.ngrok.io) so the
    // dev server is reachable through a tunnel.
    host: true,
    allowedHosts: true,
    // Same-origin dev proxy so the SPA reaches the bridge + CSAI via /api and
    // /csai (relative) — mirrors the production nginx routing, so there is NO
    // CORS and no HTTPS->HTTP mixed content through a tunnel. Enable it by
    // setting VITE_API_BASE=/api and VITE_CSAI_BASE=/csai in .env.
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/csai': {
        target: 'http://localhost:8092',
        changeOrigin: true,
        ws: true, // /csai/chat WebSocket
        rewrite: (p) => p.replace(/^\/csai/, ''),
      },
      '/ldapadmin': {
        target: 'http://localhost:8093',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ldapadmin/, ''),
      },
      '/discuss': {
        target: 'http://localhost:8094',
        changeOrigin: true,
        ws: true, // /files/{uid}/live WebSocket (§10h)
        rewrite: (p) => p.replace(/^\/discuss/, ''),
      },
      '/audit': {
        target: 'http://localhost:8097', // audit query/export/verify API (§9)
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/audit/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'html'],
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules/', 'src/tests/', 'src/**/types.ts', 'src/main.ts', 'src/App.vue', 'src/router/**/*']
    }
  }
})