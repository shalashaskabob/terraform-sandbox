import { defineConfig } from 'vite';

// Static single-page app. `base: './'` keeps asset paths relative so the
// build works whether it's served from a domain root or a subfolder
// (e.g. Cloudflare Pages, GitHub Pages, or opened directly).
export default defineConfig({
  base: './',
});
