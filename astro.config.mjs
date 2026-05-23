// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.reiningfactory.com',
  integrations: [sitemap()],
  server: {
    host: true,
    port: 4321,
    allowedHosts: ["reining-factory.loca.lt"]
  },
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
