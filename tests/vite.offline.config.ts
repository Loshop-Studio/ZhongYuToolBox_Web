import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: [
    { find: 'ezy-board-viewer', replacement: fileURLToPath(new URL('../packages/ezy-board-viewer/src/index.js', import.meta.url)) },
    { find: '@/api/pdfNote', replacement: fileURLToPath(new URL('./mockPdfUpload.ts', import.meta.url)) },
    { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) }
  ] },
  optimizeDeps: { exclude: ['pdfjs-dist'] },
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5175, strictPort: true, watch: { ignored: ['**/.local/**', '**/release/**'] } }
})
