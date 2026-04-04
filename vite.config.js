import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Mux player + hls.js → separate chunk, only loaded on video pages
          if (id.includes('@mux') || id.includes('hls.js') || id.includes('hls/')) {
            return 'mux-player'
          }
          // Supabase → separate chunk, cached independently
          if (id.includes('@supabase')) {
            return 'supabase'
          }
          // React core → stable chunk, long-lived cache
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor'
          }
        },
      },
    },
  },
})
