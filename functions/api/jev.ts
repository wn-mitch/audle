import { handleJevRequest } from '../../src/lib/jev/proxy';

interface Env {
  TYPESAFE_API_KEY?: string;
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleJevRequest(request, env.TYPESAFE_API_KEY);
