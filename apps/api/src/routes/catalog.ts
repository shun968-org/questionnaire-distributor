import { Hono } from 'hono';
import { newContext } from './context.ts';
import type { CatalogService } from '../services/catalog.ts';

export const catalogRoutes = (service: CatalogService) => new Hono().get('/', async (c) => c.json(await service.get(newContext())));
