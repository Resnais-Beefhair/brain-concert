import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js is split into its own ~504 kB chunk; allow it without masking real app growth.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
