import type { RequestContext } from '../services/ports/index.ts';

export const newContext = (): RequestContext => ({ requestId: crypto.randomUUID() });
