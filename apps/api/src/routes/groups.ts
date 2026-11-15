import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  addPatientsBodySchema,
  groupBodySchema,
  idParamSchema,
  patientParamSchema,
  startDateBodySchema,
  suspendBodySchema,
} from '../schemas/api/requests.ts';
import type { GroupService } from '../services/groups.ts';
import { newContext } from './context.ts';

const ok = { ok: true };

export const groupRoutes = (service: GroupService) =>
  new Hono()
    .get('/', async (c) => c.json(await service.list(newContext())))
    .post('/', zValidator('json', groupBodySchema), async (c) =>
      c.json(await service.create(newContext(), c.req.valid('json')), 201),
    )
    .get('/:id', zValidator('param', idParamSchema), async (c) =>
      c.json(await service.get(newContext(), c.req.valid('param').id)),
    )
    .put('/:id', zValidator('param', idParamSchema), zValidator('json', groupBodySchema), async (c) => {
      await service.update(newContext(), c.req.valid('param').id, c.req.valid('json'));
      return c.json(ok);
    })
    .post('/:id/patients', zValidator('param', idParamSchema), zValidator('json', addPatientsBodySchema), async (c) => {
      await service.addPatients(newContext(), c.req.valid('param').id, c.req.valid('json').count);
      return c.json(ok, 201);
    })
    .post('/:id/confirm', zValidator('param', idParamSchema), async (c) => {
      await service.confirm(newContext(), c.req.valid('param').id);
      return c.json(ok);
    });

export const patientRoutes = (service: GroupService) =>
  new Hono()
    .delete('/:patientId', zValidator('param', patientParamSchema), async (c) => {
      await service.removePatient(newContext(), c.req.valid('param').patientId);
      return c.json(ok);
    })
    .put(
      '/:patientId/start-date',
      zValidator('param', patientParamSchema),
      zValidator('json', startDateBodySchema),
      async (c) => {
        await service.setStartDate(newContext(), c.req.valid('param').patientId, c.req.valid('json').startDate);
        return c.json(ok);
      },
    )
    .post(
      '/:patientId/suspension',
      zValidator('param', patientParamSchema),
      zValidator('json', suspendBodySchema),
      async (c) => {
        const body = c.req.valid('json');
        await service.suspend(newContext(), c.req.valid('param').patientId, body.suspendedOn, body.reason);
        return c.json(ok);
      },
    )
    .delete('/:patientId/suspension', zValidator('param', patientParamSchema), async (c) => {
      await service.cancelSuspension(newContext(), c.req.valid('param').patientId);
      return c.json(ok);
    });
