import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCoreProxyUrl, resolveCoreApiTarget } from './src/api/devCoreTarget.js';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function devdiaryCoreProxy() {
  return {
    name: 'devdiary-core-proxy',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const upstreamUrl = buildCoreProxyUrl(req.url);
          const headers = { ...req.headers };
          delete headers.host;
          const method = req.method || 'GET';
          const upstream = await fetch(upstreamUrl, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : await readBody(req),
            redirect: 'manual',
          });
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, value);
          });
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.end(buffer);
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            error: 'core_unreachable',
            message: 'Core API is not reachable.',
            target: resolveCoreApiTarget(),
            detail: err instanceof Error ? err.message : String(err),
          }));
        }
      });
    },
  };
}

// DevDiary UI — Vite + React (從 Open Design app.html prototype 移植)
export default defineConfig({
  base: './',
  plugins: [react(), devdiaryCoreProxy()],
  server: {
    port: 5173,
    open: true,
  },
});
