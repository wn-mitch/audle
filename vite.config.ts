import { svelte } from '@sveltejs/vite-plugin-svelte';
import { Readable } from 'node:stream';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Serves `/api/jev` in `vite dev` with the same handler the Pages Function uses. */
const jevDevApi = (): Plugin => ({
  name: 'audle-jev-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/jev', async (req, res) => {
      const { handleJevRequest } = await server.ssrLoadModule('/src/lib/jev/proxy.ts');
      const request = new Request(new URL(req.originalUrl ?? '/api/jev', 'http://localhost'), {
        method: req.method,
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
        body: req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined,
        duplex: 'half',
      } as RequestInit);
      const response: Response = await handleJevRequest(request, process.env.TYPESAFE_API_KEY);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });
  },
});

export default defineConfig({
  plugins: [svelte(), jevDevApi()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
