import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: '../public/admin',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
  },
})
