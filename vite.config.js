import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable.png'],
      manifest: {
        name: 'Система учёта и склада',
        short_name: 'Склад',
        description: 'Учёт и склад · маркетинг банка',
        lang: 'ru',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        /* Ссылки с наклеек должны открываться в установленном приложении,
           а не в браузере. Android спросит один раз и запомнит выбор;
           на iPhone такой возможности нет — там откроется Safari. */
        handle_links: 'preferred',
        capture_links: 'existing-client-navigate',
        launch_handler: { client_mode: 'navigate-existing' },
        background_color: '#0A0C10',
        theme_color: '#4B45E4',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        /* Новая версия занимает место сразу, а не после закрытия всех вкладок.
           Без этого установленное приложение держало старую сборку неделями —
           помогало только удаление и переустановка. */
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
