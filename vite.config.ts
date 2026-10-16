import { defineConfig } from 'vite';

// base relativa: funciona tanto en usuario.github.io como en usuario.github.io/repo
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
