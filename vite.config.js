import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the Python scraper backend (server/api.py).
      '/api': 'http://127.0.0.1:5174',
    },
  },
})
