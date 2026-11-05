import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // three.js is most of the download; keep it in its own file so it stays cached between app updates
        manualChunks: { three: ['three'] }
      }
    }
  }
});
