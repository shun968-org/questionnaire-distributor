import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // 開発時は /api/ 以下を API に転送する(ADR-0001)
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
});
