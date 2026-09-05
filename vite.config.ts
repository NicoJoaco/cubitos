import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { SKY_HEX, APP_NAME, APP_SHORT } from './src/theme.ts';

export default defineConfig({
  // Rutas relativas: obligatorio para GitHub Pages en subcarpeta Y para el
  // esquema file://-like que usa el WebView de Capacitor.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Un solo chunk de app + uno de three: menos requests que el SW debe
        // precachear y menos overhead de módulos en gama media.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // El plugin ya inyecta manifest e iconos; sin esto quedan duplicados en el precache.
      includeManifestIcons: false,
      injectRegister: 'auto',
      workbox: {
        // Precache de TODO el bundle. Sin runtime caching de red: el juego no
        // hace ni una sola petición externa.
        globPatterns: ['**/*.{js,css,html,png,svg,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT,
        description: 'Mundo de cubos para construir. Funciona sin internet.',
        lang: 'es',
        start_url: './index.html',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: SKY_HEX,
        theme_color: SKY_HEX,
        categories: ['games', 'kids'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
