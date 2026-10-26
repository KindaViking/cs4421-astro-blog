// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import node from '@astrojs/node';

// BUILD_TARGET=static builds a plain static site for S3, with no Node server.
const isStatic = process.env.BUILD_TARGET === 'static';

// https://astro.build/config
export default defineConfig({
  site: 'http://AstroA-Servi-hALX5bpxRAFJ-214040983.us-east-1.elb.amazonaws.com',
  output: isStatic ? 'static' : 'server',
  integrations: [mdx(), sitemap()],

  fonts: [
      {
          provider: fontProviders.local(),
          name: 'Atkinson',
          cssVariable: '--font-atkinson',
          fallbacks: ['sans-serif'],
          options: {
              variants: [
                  {
                      src: ['./src/assets/fonts/atkinson-regular.woff'],
                      weight: 400,
                      style: 'normal',
                      display: 'swap',
                  },
                  {
                      src: ['./src/assets/fonts/atkinson-bold.woff'],
                      weight: 700,
                      style: 'normal',
                      display: 'swap',
                  },
              ],
          },
      },
  ],

  adapter: isStatic ? undefined : node({
    mode: 'standalone',
  }),

  vite: {
    // satellite.js ships an optional WebAssembly worker that uses top-level
    // await, which Vite's default 'iife' worker format can't bundle.
    worker: { format: 'es' },
    // Lets pages check import.meta.env.STATIC_BUILD to leave out server-only parts.
    define: { 'import.meta.env.STATIC_BUILD': JSON.stringify(isStatic) },
  },
});
