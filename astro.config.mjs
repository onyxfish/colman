import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import remarkGfm from 'remark-gfm';

// https://astro.build/config
export default defineConfig({
  site: "https://colmanetchings.com",
  integrations: [tailwind(), sitemap()],
  markdown: {
    remarkPlugins: [remarkGfm],
  },
});