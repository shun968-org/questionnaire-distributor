import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { BusinessError, ConflictError, NotFoundError, ValidationError } from './errors/index.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { groupRoutes, patientRoutes } from './routes/groups.ts';
import { planRoutes } from './routes/plans.ts';
import { questionnaireRoutes } from './routes/questionnaires.ts';
import { createCatalogService } from './services/catalog.ts';
import { createGroupService } from './services/groups.ts';
import { createPlanService } from './services/plans.ts';
import type { UnitOfWork } from './services/ports/index.ts';
import { createQuestionnaireService } from './services/questionnaires.ts';

type Options = {
  uow: UnitOfWork;
  /** 管理画面のビルド結果のディレクトリ。指定すると `/` で配信する(本番) */
  webDist?: string;
  /** 今日の日付(YYYY-MM-DD)。指定しなければ日本時間の今日 */
  today?: () => string;
};

const todayInJapan = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

export function createApp({ uow, webDist, today = todayInJapan }: Options) {
  const groupService = createGroupService({ uow, today, now: () => new Date() });

  const api = new Hono()
    .route('/catalog', catalogRoutes(createCatalogService(uow)))
    .route('/questionnaires', questionnaireRoutes(createQuestionnaireService(uow)))
    .route('/plans', planRoutes(createPlanService(uow)))
    .route('/groups', groupRoutes(groupService))
    .route('/patients', patientRoutes(groupService));

  const app = new Hono().route('/api', api);

  // 業務エラーから HTTP のステータスへの変換は、ここだけで行う
  app.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json({ message: err.message }, 404);
    if (err instanceof ConflictError) return c.json({ message: err.message }, 409);
    if (err instanceof ValidationError) return c.json({ message: err.message }, 422);
    if (err instanceof BusinessError) return c.json({ message: err.message }, 400);
    console.error(err);
    return c.json({ message: 'サーバでエラーが起きた' }, 500);
  });
  app.all('/api/*', (c) => c.json({ message: 'Not Found' }, 404));

  if (webDist) {
    app.use('*', serveStatic({ root: webDist }));
    // SPA なので、ファイルがないパスには index.html を返す
    app.get('*', serveStatic({ root: webDist, path: 'index.html' }));
  }
  return { app, api };
}

/** API 全体の型。管理画面の API クライアントが、型だけを import する */
export type AppType = ReturnType<typeof createApp>['api'];
