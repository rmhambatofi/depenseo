// Application React-admin (`/admin/`, ADR-044) : servie par l'API à une session admin seulement.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./src/app', import.meta.url)),
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/app', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    // React-admin + MUI : ~1 Mo, chargé une fois par une poignée d'administrateurs.
    chunkSizeWarningLimit: 1500,
  },
});
