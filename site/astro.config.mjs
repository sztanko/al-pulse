import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Published to GitHub Pages under /al-pulse, same as the Evidence site, so
// every existing URL keeps resolving.
export default defineConfig({
  site: 'https://sztanko.github.io',
  base: '/al-pulse',
  trailingSlash: 'ignore',
  integrations: [react()],
  build: { inlineStylesheets: 'auto' },
  vite: {
    build: {
      // Keep chunks small so a page that hydrates one island does not pull the
      // others in with it.
      assetsInlineLimit: 2048,
    },
  },
});
