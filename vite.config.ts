/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { siteMetadata } from './siteMetadata'

// Vite can embed Vercel system metadata when code reads import.meta.env as an object.
// Remove these unused values before Vite loads the environment.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('VITE_VERCEL_')) delete process.env[key]
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [siteMetadata(), react(), tailwindcss()],
  esbuild: {
    drop: ['console', 'debugger'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    maxWorkers: 2,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})
