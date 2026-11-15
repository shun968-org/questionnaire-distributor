// ルートの定義。URL と画面の対応と、画面を開くときのデータの読み込みを、ここ 1 か所に書く(ADR-0003)。
import { createBrowserRouter, redirect } from 'react-router';
import { api } from './api/client.ts';
import { GroupDetailPage, GroupListPage } from './pages/GroupPages.tsx';
import { ErrorPage, Layout } from './pages/Layout.tsx';
import { PlanEditPage, PlanListPage } from './pages/PlanPages.tsx';
import { QuestionnaireEditPage, QuestionnaireListPage, QuestionnairePreviewPage } from './pages/QuestionnairePages.tsx';

const templateKey = (request: Request) => new URL(request.url).searchParams.get('template');

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, loader: () => redirect('/plans') },
      {
        path: 'questionnaires',
        Component: QuestionnaireListPage,
        loader: async () => {
          const [questionnaires, catalog] = await Promise.all([api.questionnaires.list(), api.catalog()]);
          return { questionnaires, catalog };
        },
      },
      {
        path: 'questionnaires/new',
        Component: QuestionnaireEditPage,
        loader: async ({ request }) => ({ catalog: await api.catalog(), questionnaire: null, templateKey: templateKey(request) }),
      },
      {
        path: 'questionnaires/:id',
        Component: QuestionnairePreviewPage,
        loader: async ({ params }) => ({ questionnaire: await api.questionnaires.get(params.id!) }),
      },
      {
        path: 'questionnaires/:id/edit',
        Component: QuestionnaireEditPage,
        loader: async ({ params }) => {
          const [catalog, questionnaire] = await Promise.all([api.catalog(), api.questionnaires.get(params.id!)]);
          return { catalog, questionnaire, templateKey: null };
        },
      },
      {
        path: 'plans',
        Component: PlanListPage,
        loader: async () => {
          const [plans, catalog] = await Promise.all([api.plans.list(), api.catalog()]);
          return { plans, catalog };
        },
      },
      {
        path: 'plans/new',
        Component: PlanEditPage,
        loader: async ({ request }) => {
          const [catalog, questionnaires] = await Promise.all([api.catalog(), api.questionnaires.list()]);
          return { catalog, questionnaires, plan: null, templateKey: templateKey(request) };
        },
      },
      {
        path: 'plans/:id',
        Component: PlanEditPage,
        loader: async ({ params }) => {
          const [catalog, questionnaires, plan] = await Promise.all([
            api.catalog(),
            api.questionnaires.list(),
            api.plans.get(params.id!),
          ]);
          return { catalog, questionnaires, plan, templateKey: null };
        },
      },
      {
        path: 'groups',
        Component: GroupListPage,
        loader: async () => {
          const [groups, plans] = await Promise.all([api.groups.list(), api.plans.list()]);
          return { groups, plans };
        },
      },
      {
        path: 'groups/:id',
        Component: GroupDetailPage,
        loader: async ({ params }) => {
          const [detail, plans] = await Promise.all([api.groups.get(params.id!), api.plans.list()]);
          return { detail, plans };
        },
      },
    ],
  },
]);
