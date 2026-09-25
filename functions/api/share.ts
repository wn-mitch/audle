import type { ShortLinkStore } from '../../src/lib/share/short-link';
import { handleShareCreate } from '../../src/lib/share/short-link';

interface Env {
  AUDLE_SHARES: ShortLinkStore;
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleShareCreate(request, env.AUDLE_SHARES);
