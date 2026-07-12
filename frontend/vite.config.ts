import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API base URL is injected at build time from the CDK stack output
// (VITE_API_URL). See frontend/deploy.sh.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
