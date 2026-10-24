import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable, and works with the network off once opened: every file of the app is cached on the tablet.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'fonts/*.woff2'],
      manifest: {
        name: 'MasterMath',
        short_name: 'MasterMath',
        description: 'Daily arithmetic worksheets with corrections, written with a stylus.',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#fcfbf7',
        theme_color: '#1b1b1b',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2,txt,svg}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
});
