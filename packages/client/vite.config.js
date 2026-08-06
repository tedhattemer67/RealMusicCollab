import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy means the browser only ever talks to the Vite dev server
// (localhost:5173) — /api requests get forwarded to Express behind the
// scenes, so there's no cross-origin request during local development at
// all. The server's CORS setup still matters once this is deployed for
// real, where the frontend and backend genuinely are different origins.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
