import { type ShortLinkStore, handleShareOpen } from '../../src/lib/share/short-link';

interface Env {
  AUDLE_SHARES: ShortLinkStore;
}

export const onRequest = ({
  request,
  env,
  params,
}: {
  request: Request;
  env: Env;
  params: { id: string };
}) => handleShareOpen(request, env.AUDLE_SHARES, params.id);
