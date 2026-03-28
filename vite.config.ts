import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'eggplant-monaco-vim-web-editor';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : '/',
});
