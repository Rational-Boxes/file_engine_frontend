import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
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