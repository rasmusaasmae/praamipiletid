import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    // The API runs separately in development; share its origin through a proxy
    // so the session cookie works as in production.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
