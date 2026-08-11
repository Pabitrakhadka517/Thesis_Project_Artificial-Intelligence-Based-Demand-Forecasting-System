import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large, slow-changing vendor code into its own cacheable
        // chunks so a browser that already has these doesn't re-download
        // them on every app deploy — only app-code chunks (which change
        // far more often) get invalidated.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          if (/[\\/](@reduxjs|react-redux|redux-persist|redux)[\\/]/.test(id)) return 'redux-vendor'
          if (id.includes('framer-motion')) return 'motion-vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/product-images': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
