import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  // GitHub Pages 部署时使用，先注释，阶段8启用
  // base: '/student-union-platform/',
});
