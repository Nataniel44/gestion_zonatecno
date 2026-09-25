import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { port: 5174 },
  preview: {
    allowedHosts: ['gestion.zonatecno.uno', 'app.zonatecno.uno']
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ZonaTecno Gestión',
        short_name: 'ZT Gestión',
        description: 'Ventas, stock, caja y taller. Funciona sin internet.',
        theme_color: '#0a141f',
        background_color: '#0a141f',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        lang: 'es-AR'
      },
      workbox: {
        // Cachea app shell para uso offline. Los datos van en IndexedDB (Dexie).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html'
      }
    })
  ]
});
