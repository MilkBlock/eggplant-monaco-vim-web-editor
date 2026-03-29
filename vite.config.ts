import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'eggplant-monaco-vim-web-editor';
const pluginSrcRoot = resolve(
  __dirname,
  'vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src',
);

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : '/',
  resolve: {
    alias: {
      '@eggplant-shared': resolve(pluginSrcRoot, 'shared'),
      '@eggplant-vscode': pluginSrcRoot,
    },
  },
  server: {
    fs: {
      allow: [pluginSrcRoot],
    },
  },
});
