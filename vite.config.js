import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Splits stable vendor code into long-lived cached chunks (spec §12). */
function vendorChunk(id) {
  if (!id.includes('node_modules')) return undefined;
  if (/[\\/]@supabase[\\/]/.test(id)) return 'vendor-supabase';
  if (/[\\/]@tanstack[\\/]/.test(id)) return 'vendor-query';
  if (
    /[\\/]react-router/.test(id) ||
    /[\\/]react-dom[\\/]/.test(id) ||
    /[\\/]node_modules[\\/]react[\\/]/.test(id) ||
    /[\\/]scheduler[\\/]/.test(id)
  ) {
    return 'vendor-react';
  }
  return undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}'],
    css: false,
  },
});
