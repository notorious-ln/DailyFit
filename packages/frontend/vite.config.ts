import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      '/register': 'http://127.0.0.1:3000',
      '/login': 'http://127.0.0.1:3000',
      '/profile': 'http://127.0.0.1:3000',
    },
  },
});
