import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { Readable } from 'node:stream';
import type { Plugin, ViteDevServer } from 'vite';
import type { ShortLinkStore } from './src/lib/share/short-link.ts';
import { defineConfig } from 'vitest/config';

type DevHandler = (request: Request, pathname: string) => Promise<Response>;

/** Bridges a connect middleware mount onto a Pages Function handler. */
const bridge = (server: ViteDevServer, mount: string, handler: DevHandler) => {
  server.middlewares.use(mount, async (req, res) => {
    // The handler builds absolute URLs from the request origin, so keep the host the browser used.
    const authority = req.headers.host ?? 'localhost';
    const url = new URL(req.originalUrl ?? mount, `http://${authority}`);
    const request = new Request(url, {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
      body: req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: 'half',
    } as RequestInit);
    const response = await handler(request, url.pathname);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  });
};

/** Serves `/api/jev`, `/api/share`, and `/s/:id` in `vite dev` with the handlers the Functions use. */
const devApi = (): Plugin => ({
  name: 'audle-dev-api',
  configureServer(server) {
    // One in-memory store for the dev server's lifetime, mirroring the KV binding production has.
    let store: Promise<ShortLinkStore> | undefined;
    const shareStore = () =>
      (store ??= server
        .ssrLoadModule('/src/lib/share/short-link.ts')
        .then((module) => module.memoryShareStore()));

    bridge(server, '/api/jev', async (request) => {
      const { handleJevRequest } = await server.ssrLoadModule('/src/lib/jev/proxy.ts');
      return handleJevRequest(request, process.env.TYPESAFE_API_KEY);
    });
    bridge(server, '/api/share', async (request) => {
      const { handleShareCreate } = await server.ssrLoadModule('/src/lib/share/short-link.ts');
      return handleShareCreate(request, await shareStore());
    });
    bridge(server, '/s', async (request, pathname) => {
      const { handleShareOpen } = await server.ssrLoadModule('/src/lib/share/short-link.ts');
      return handleShareOpen(request, await shareStore(), pathname.slice('/s/'.length));
    });
  },
});

export default defineConfig({
  plugins: [tailwindcss(), svelte(), devApi()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
