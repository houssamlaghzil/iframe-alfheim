import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            /* API REST */
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true
            },
            /* 📂  Fichiers statiques (GLB) */
            '/files': {
                target: 'http://localhost:4000',
                changeOrigin: true
            }
        }
    }
});
