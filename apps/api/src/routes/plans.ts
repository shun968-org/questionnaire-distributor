import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { idParamSchema, planBodySchema } from '../schemas/api/requests.ts';
import type { PlanService } from '../services/plans.ts';
import { newContext } from './context.ts';

export const planRoutes = (service: PlanService) =>
  new Hono()
    .get('/', async (c) => c.json(await service.list(newContext())))
    .post('/', zValidator('json', planBodySchema), async (c) =>
      c.json(await service.create(newContext(), c.req.valid('json')), 201),
    )
    .get('/:id', zValidator('param', idParamSchema), async (c) =>
      c.json(await service.get(newContext(), c.req.valid('param').id)),
    )
    .put('/:id', zValidator('param', idParamSchema), zValidator('json', planBodySchema), async (c) =>
      c.json(await service.update(newContext(), c.req.valid('param').id, c.req.valid('json'))),
    )
    .delete('/:id', zValidator('param', idParamSchema), async (c) => {
      await service.delete(newContext(), c.req.valid('param').id);
      return c.json({ ok: true });
    });
