import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/register': apiTarget,
      '/login': apiTarget,
      '/profile': apiTarget,
      '/templates': apiTarget,
      '/plans': apiTarget,
      '/day': apiTarget,
      '/diary': apiTarget,
      '/progress': apiTarget,
      '/activate-workout': apiTarget,
      '/activate-meal': apiTarget,
      '/analyze': apiTarget,
      '/recommendations': apiTarget,
      '/reports': apiTarget,
      '/admin': apiTarget,
    },
  },
});
