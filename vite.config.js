import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    // Match common Supabase "Site URL" for local dev (http://localhost:3000). Override: vite --port 5173
    port: 3000,
    strictPort: false,
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
