// Page de connexion publique (`/admin/login`, ADR-044) : build séparé, sans React ni code admin.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./src/login', import.meta.url)),
  base: '/admin/login/',
  build: {
    outDir: fileURLToPath(new URL('./dist/login', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    // Aucun fichier en ligne (data:) : la CSP n'autorise que l'origine.
    assetsInlineLimit: 0,
  },
});
