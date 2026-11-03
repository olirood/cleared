// Punto de entrada en Cloudflare: el sitio (OpenNext) más el respaldo mensual programado.
// @ts-expect-error: lo genera `opennextjs-cloudflare build`
import site from './.open-next/worker.js';

// @ts-expect-error: lo genera `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

type Env = { CLEARED_SERVER_KEY?: string };

export default {
  fetch: site.fetch,
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    if (!env.CLEARED_SERVER_KEY) return;
    const req = new Request('https://cleared.internal/api/backup', { method: 'POST', headers: { 'x-cleared-key': env.CLEARED_SERVER_KEY } });
    ctx.waitUntil(site.fetch(req, env, ctx));
  },
};
