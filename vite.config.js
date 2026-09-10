import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const BUILD_TIME = new Date().toISOString();

// Injects the build timestamp into dist/sw.js so the browser detects
// a changed service worker on every deploy and reloads with fresh assets.
function swVersionPlugin() {
  return {
    name: 'sw-version',
    closeBundle() {
      const swPath = path.resolve('dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const sw = fs.readFileSync(swPath, 'utf-8');
      fs.writeFileSync(swPath, sw.replace('__BUILD_DATE__', BUILD_TIME));
    },
  };
}

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
})
