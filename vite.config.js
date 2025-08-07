import { defineConfig } from 'vite';          // ← import manquant
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        react(),
        tailwind()
    ],
    server: {
        proxy: {
            '/api':   'http://localhost:4000',
            '/files': 'http://localhost:4000'
        }
    }
});
